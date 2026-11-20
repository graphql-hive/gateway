import type { SubschemaConfig } from '@graphql-tools/delegate';
import type {
  ExecutionRequest,
  ExecutionResult,
  Executor,
} from '@graphql-tools/utils';
import { handleMaybePromise, isPromise } from '@whatwg-node/promise-helpers';
import type {
  DocumentNode,
  GraphQLFieldResolver,
  GraphQLSchema,
} from 'graphql';
import {
  compileRawForwardPlan,
  RawForwardPlan,
  subgraphDocumentMatchesPlan,
} from './plan';
import { verifyRawForwardBody } from './verifier';

// Raw forward: when the response of a client operation is, byte for byte, the
// response of one subgraph request, the subgraph body is checked against the
// schema as bytes and handed to the HTTP response without building the result
// objects and without serializing them again.
//
// How the pieces are used:
//   registerRawForwardSchema()            once per stitched supergraph schema
//   wrapExecuteFnForRawForward()          around the execution of a client operation: plans it
//                                         (cached per document) and marks the execution context
//   wrapSubschemaExecutorForRawForward()  around a subgraph's executor: for the request that resolves
//                                         the root field of a marked execution, checks the delegated
//                                         document, asks the transport for a raw result and, when
//                                         it gets one, ends the delegation
// Every "no" on the way leaves the operation on the regular path, with the
// same single subgraph request and its body parsed once.

// The protocol of `@graphql-tools/executor-http`. Registered symbols, so that
// no import is needed; a transport that does not know them answers as usual.
const RAW_RESULT_ACCEPTOR = Symbol.for(
  '@graphql-tools/executor-http:rawResultAcceptor',
);
const RAW_RESULT_BODY = Symbol.for(
  '@graphql-tools/executor-http:rawResultBody',
);
function getRawResultBody(result: unknown): Uint8Array | undefined {
  return (result as any)?.[RAW_RESULT_BODY];
}

interface RawForwardSchema {
  schema: GraphQLSchema;
  defaultFieldResolver?: GraphQLFieldResolver<any, any>;
  plans: WeakMap<DocumentNode, Map<string, PlanEntry | null>>;
}
interface PlanEntry {
  plan: RawForwardPlan;
  accept: (body: Uint8Array) => boolean;
}
interface ExecutionState {
  schema: RawForwardSchema;
  entry: PlanEntry;
  /** Only one subgraph request of an execution is a candidate. */
  used: boolean;
  rawResult?: ExecutionResult;
}

const schemas = new WeakMap<GraphQLSchema, RawForwardSchema>();
const stateByContext = new WeakMap<object, ExecutionState>();

/**
 * Makes the operations of a stitched supergraph schema candidates for raw forward.
 * Not to be called for a schema in which the gateway resolves fields itself
 * (additional resolvers), other than through `defaultFieldResolver`.
 */
export function registerRawForwardSchema(
  schema: GraphQLSchema,
  opts: { defaultFieldResolver?: GraphQLFieldResolver<any, any> } = {},
): void {
  schemas.set(schema, {
    schema,
    defaultFieldResolver: opts.defaultFieldResolver,
    plans: new WeakMap(),
  });
}

function getPlanEntry(
  schema: RawForwardSchema,
  document: DocumentNode,
  operationName: string | null | undefined,
): PlanEntry | null {
  let byOperationName = schema.plans.get(document);
  if (!byOperationName) {
    byOperationName = new Map();
    schema.plans.set(document, byOperationName);
  }
  const key = operationName ?? '';
  let entry = byOperationName.get(key);
  if (entry === undefined) {
    let plan: RawForwardPlan | null = null;
    try {
      plan = compileRawForwardPlan(schema, document, operationName);
    } catch {
      // not eligible
    }
    entry = plan && {
      plan,
      accept: (body) => verifyRawForwardBody(plan.root, body),
    };
    byOperationName.set(key, entry);
  }
  return entry;
}

let textDecoder: TextDecoder | undefined;
// The response body. Still reads as the JSON text when something treats it as a string.
class RawForwardBody extends Uint8Array {
  override toString(): string {
    textDecoder ||= new TextDecoder();
    return textDecoder.decode(this);
  }
}

/**
 * The result of the client operation. `stringify` (the serializer hook of
 * GraphQL Yoga) returns the subgraph bytes while nobody has read or changed
 * the result; `data` parses on first read and from then on the result
 * serializes like any other.
 */
function createRawForwardResult(rawResult: ExecutionResult): ExecutionResult {
  const rawBody = getRawResultBody(rawResult);
  if (!rawBody) {
    // somebody kept the subgraph result and read its data in the meantime
    return { data: rawResult.data };
  }
  let body: Uint8Array | undefined = new RawForwardBody(
    rawBody.buffer as ArrayBuffer,
    rawBody.byteOffset,
    rawBody.byteLength,
  );
  const result: ExecutionResult = {};
  function settle(data: any) {
    body = undefined;
    Object.defineProperty(result, 'data', {
      value: data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return data;
  }
  Object.defineProperty(result, 'data', {
    enumerable: true,
    configurable: true,
    get: () => settle(rawResult.data),
    set: settle,
  });
  Object.defineProperty(result, 'stringify', {
    enumerable: false,
    configurable: true,
    writable: true,
    value(target: ExecutionResult) {
      if (
        body &&
        target === result &&
        result.errors === undefined &&
        result.extensions === undefined &&
        Object.keys(result).length === 1
      ) {
        return body;
      }
      return JSON.stringify(target);
    },
  });
  return result;
}

type ExecuteFn = (args: {
  schema: GraphQLSchema;
  document: DocumentNode;
  contextValue?: any;
  operationName?: string | null;
}) => any;

const wrappedExecuteFns = new WeakMap<ExecuteFn, ExecuteFn>();

/**
 * Wraps the function executing client operations. Operations of a schema that
 * is not registered, and operations that are not eligible, are executed as is.
 */
export function wrapExecuteFnForRawForward<TExecuteFn extends ExecuteFn>(
  executeFn: TExecuteFn,
): TExecuteFn {
  let wrapped = wrappedExecuteFns.get(executeFn);
  if (!wrapped) {
    wrapped = function rawForwardExecute(args) {
      const schema = schemas.get(args.schema);
      const context = args.contextValue;
      if (
        !schema ||
        context == null ||
        typeof context !== 'object' ||
        stateByContext.has(context)
      ) {
        return executeFn(args);
      }
      const entry = getPlanEntry(schema, args.document, args.operationName);
      if (!entry) {
        return executeFn(args);
      }
      const state: ExecutionState = { schema, entry, used: false };
      stateByContext.set(context, state);
      return handleMaybePromise(
        () => executeFn(args),
        (result) => {
          stateByContext.delete(context);
          return state.rawResult
            ? createRawForwardResult(state.rawResult)
            : result;
        },
        (error) => {
          stateByContext.delete(context);
          throw error;
        },
      );
    };
    wrappedExecuteFns.set(executeFn, wrapped);
  }
  return wrapped as TExecuteFn;
}

/**
 * Wraps the executor of a subgraph. Requests that do not resolve the root
 * field of an eligible client operation are passed on untouched.
 */
export function wrapSubschemaExecutorForRawForward(
  subschemaConfig: Pick<SubschemaConfig, 'transforms'>,
  executor: Executor,
): Executor {
  return function rawForwardSubschemaExecutor(request: ExecutionRequest) {
    const context = request.context;
    const state =
      context != null && typeof context === 'object'
        ? stateByContext.get(context)
        : undefined;
    if (!state || state.used) {
      return executor(request);
    }
    const { plan, accept } = state.entry;
    const info = request.info;
    if (
      // the request has to come from resolving the root field of the client operation
      info?.operation !== plan.operation ||
      info.path.prev ||
      info.path.key !== plan.rootKey
    ) {
      return executor(request);
    }
    state.used = true;
    if (
      // transforms change the subgraph result on its way back
      subschemaConfig.transforms?.length ||
      !subgraphDocumentMatchesPlan(state.schema.schema, plan, request.document)
    ) {
      return executor(request);
    }
    (request as any)[RAW_RESULT_ACCEPTOR] = accept;
    function onResult(result: any) {
      // No bytes: the transport did not keep them, the body was not accepted or a
      // plugin has read the data. The result is the regular one in all of these.
      if (!getRawResultBody(result)) {
        return result;
      }
      state!.rawResult = result;
      // The delegation ends here. Whatever the execution makes of this placeholder
      // is replaced by the raw forward result once it completes.
      return { data: { [plan.rootKey]: null } };
    }
    const result$ = executor(request);
    return isPromise(result$) ? result$.then(onResult) : onResult(result$);
  } as Executor;
}
