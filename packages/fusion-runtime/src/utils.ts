import type {
  Transport,
  TransportContext,
  TransportEntry,
  TransportGetSubgraphExecutor,
  TransportGetSubgraphExecutorOptions,
} from '@graphql-mesh/transport-common';
import type { Logger } from '@graphql-mesh/types';
import {
  isDisposable,
  iterateAsync,
  loggerForExecutionRequest,
  requestIdByRequest,
} from '@graphql-mesh/utils';
import {
  DelegationPlanBuilder,
  MergedTypeResolver,
  Subschema,
} from '@graphql-tools/delegate';
import {
  isAsyncIterable,
  isDocumentNode,
  mapAsyncIterator,
  mapMaybePromise,
  printSchemaWithDirectives,
  type ExecutionRequest,
  type Executor,
  type Maybe,
  type MaybePromise,
} from '@graphql-tools/utils';
import { constantCase } from 'constant-case';
import {
  FragmentDefinitionNode,
  print,
  SelectionNode,
  SelectionSetNode,
  type DocumentNode,
  type ExecutionResult,
  type GraphQLSchema,
} from 'graphql';
import type { GraphQLOutputType, GraphQLResolveInfo } from 'graphql/type';

export type {
  TransportEntry,
  TransportGetSubgraphExecutor,
  TransportGetSubgraphExecutorOptions,
};

export type Transports =
  | {
      [key: string]: MaybePromise<Transport | { default: Transport }>;
    }
  | ((kind: string) => MaybePromise<Transport | { default: Transport }>);

function defaultTransportsGetter(kind: string): Promise<Transport> {
  const moduleName = `@graphql-mesh/transport-${kind}`;
  return mapMaybePromise(import(moduleName), (transport) => {
    if (typeof transport !== 'object') {
      throw new Error(`${moduleName} module does not export an object`);
    }
    if (transport?.default?.getSubgraphExecutor) {
      transport = transport.default;
    }
    if (!transport?.getSubgraphExecutor) {
      throw new Error(
        `${moduleName} module does not export "getSubgraphExecutor"`,
      );
    }
    if (typeof transport?.getSubgraphExecutor !== 'function') {
      throw new Error(
        `${moduleName} module's export "getSubgraphExecutor" is not a function`,
      );
    }
    return transport;
  });
}

function getTransportExecutor({
  transportContext,
  transportEntry,
  subgraphName = '',
  subgraph,
  transports = defaultTransportsGetter,
}: {
  transportContext: TransportContext;
  transportEntry: TransportEntry;
  subgraphName?: string;
  subgraph: GraphQLSchema;
  transports?: Transports;
}): MaybePromise<Executor> {
  // TODO
  const kind = transportEntry?.kind || '';
  let logger = transportContext?.logger;
  if (logger) {
    if (subgraphName) {
      logger = logger.child(subgraphName);
    }
    logger?.debug(`Loading transport "${kind}"`);
  }
  return mapMaybePromise(
    typeof transports === 'function' ? transports(kind) : transports[kind],
    (transport) => {
      if (!transport) {
        throw new Error(`Transport "${kind}" is empty`);
      }
      if (typeof transport !== 'object') {
        throw new Error(`Transport "${kind}" is not an object`);
      }
      let getSubgraphExecutor: TransportGetSubgraphExecutor | undefined;
      if ('default' in transport) {
        getSubgraphExecutor = transport.default?.getSubgraphExecutor;
      } else {
        getSubgraphExecutor = transport.getSubgraphExecutor;
      }
      if (!getSubgraphExecutor) {
        throw new Error(
          `Transport "${kind}" does not have "getSubgraphExecutor"`,
        );
      }
      if (typeof getSubgraphExecutor !== 'function') {
        throw new Error(
          `Transport "${kind}" "getSubgraphExecutor" is not a function`,
        );
      }
      return getSubgraphExecutor({
        subgraphName,
        subgraph,
        transportEntry,
        getTransportExecutor(transportEntry) {
          return getTransportExecutor({
            transportContext,
            transportEntry,
            subgraphName,
            subgraph,
            transports,
          });
        },
        ...transportContext,
      });
    },
  );
}

export const subgraphNameByExecutionRequest = new WeakMap<
  ExecutionRequest,
  string
>();

/**
 * This function creates a executor factory that uses the transport packages,
 * and wraps them with the hooks
 */
export function getOnSubgraphExecute({
  onSubgraphExecuteHooks,
  transportContext = {},
  transportEntryMap,
  getSubgraphSchema,
  transportExecutorStack,
  transports,
}: {
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  transports?: Transports;
  transportContext?: TransportContext;
  transportEntryMap: Record<string, TransportEntry>;
  getSubgraphSchema(subgraphName: string): GraphQLSchema;
  transportExecutorStack: AsyncDisposableStack;
}) {
  const subgraphExecutorMap = new Map<string, Executor>();
  return function onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ) {
    subgraphNameByExecutionRequest.set(executionRequest, subgraphName);
    let executor = subgraphExecutorMap.get(subgraphName);
    // If the executor is not initialized yet, initialize it
    if (executor == null) {
      let logger = transportContext?.logger;
      if (logger) {
        const requestId = requestIdByRequest.get(
          executionRequest.context?.request,
        );
        if (requestId) {
          logger = logger.child(requestId);
        }
        if (subgraphName) {
          logger = logger.child(subgraphName);
        }
        logger.debug(`Initializing executor`);
      }
      // Lazy executor that loads transport executor on demand
      executor = function lazyExecutor(subgraphExecReq: ExecutionRequest) {
        return mapMaybePromise(
          // Gets the transport executor for the given subgraph
          getTransportExecutor({
            transportContext,
            subgraphName,
            get subgraph() {
              return getSubgraphSchema(subgraphName);
            },
            get transportEntry() {
              return transportEntryMap[subgraphName]!;
            },
            transports,
          }),
          (executor_) => {
            if (isDisposable(executor_)) {
              transportExecutorStack.use(executor_);
            }
            // Wraps the transport executor with hooks
            executor = wrapExecutorWithHooks({
              executor: executor_,
              onSubgraphExecuteHooks,
              subgraphName,
              transportEntryMap,
              transportContext,
              getSubgraphSchema,
            });
            // Caches the executor for future use
            subgraphExecutorMap.set(subgraphName, executor);
            return executor(subgraphExecReq);
          },
        );
      };
      // Caches the lazy executor to prevent race conditions
      subgraphExecutorMap.set(subgraphName, executor);
    }
    return executor(executionRequest);
  };
}

export interface WrapExecuteWithHooksOptions {
  executor: Executor;
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  subgraphName: string;
  transportEntryMap?: Record<string, TransportEntry>;
  getSubgraphSchema: (subgraphName: string) => GraphQLSchema;
  transportContext?: TransportContext;
}

declare module 'graphql' {
  interface GraphQLResolveInfo {
    executionRequest?: ExecutionRequest;
  }
}

/**
 * This function wraps the executor created by the transport package
 * with `onSubgraphExecuteHooks` to hook into the execution phase of subgraphs
 */
export function wrapExecutorWithHooks({
  executor,
  onSubgraphExecuteHooks,
  subgraphName,
  transportEntryMap,
  getSubgraphSchema,
  transportContext,
}: WrapExecuteWithHooksOptions): Executor {
  return function executorWithHooks(executionRequest: ExecutionRequest) {
    executionRequest.info = executionRequest.info || ({} as GraphQLResolveInfo);
    executionRequest.info.executionRequest = executionRequest;
    const requestId =
      executionRequest.context?.request &&
      requestIdByRequest.get(executionRequest.context.request);
    let execReqLogger = transportContext?.logger;
    if (execReqLogger) {
      if (requestId) {
        execReqLogger = execReqLogger.child(requestId);
      }
      loggerForExecutionRequest.set(executionRequest, execReqLogger);
    }
    execReqLogger = execReqLogger?.child?.(subgraphName);
    if (onSubgraphExecuteHooks.length === 0) {
      return executor(executionRequest);
    }
    const onSubgraphExecuteDoneHooks: OnSubgraphExecuteDoneHook[] = [];
    return mapMaybePromise(
      iterateAsync(
        onSubgraphExecuteHooks,
        (onSubgraphExecuteHook) =>
          onSubgraphExecuteHook({
            get subgraph() {
              return getSubgraphSchema(subgraphName);
            },
            subgraphName,
            get transportEntry() {
              return transportEntryMap?.[subgraphName];
            },
            executionRequest,
            setExecutionRequest(newExecutionRequest) {
              execReqLogger?.debug(
                'Updating execution request to: ',
                newExecutionRequest,
              );
              executionRequest = newExecutionRequest;
            },
            executor,
            setExecutor(newExecutor) {
              execReqLogger?.debug('executor has been updated');
              executor = newExecutor;
            },
            requestId,
            logger: execReqLogger,
          }),
        onSubgraphExecuteDoneHooks,
      ),
      () => {
        if (onSubgraphExecuteDoneHooks.length === 0) {
          return executor(executionRequest);
        }
        return mapMaybePromise(executor(executionRequest), (currentResult) => {
          const executeDoneResults: OnSubgraphExecuteDoneResult[] = [];
          return mapMaybePromise(
            iterateAsync(
              onSubgraphExecuteDoneHooks,
              (onSubgraphExecuteDoneHook) =>
                onSubgraphExecuteDoneHook({
                  result: currentResult,
                  setResult(newResult: ExecutionResult) {
                    execReqLogger?.debug('overriding result with: ', newResult);
                    currentResult = newResult;
                  },
                }),
              executeDoneResults,
            ),
            () => {
              if (!isAsyncIterable(currentResult)) {
                return currentResult;
              }

              if (executeDoneResults.length === 0) {
                return currentResult;
              }

              const onNextHooks: OnSubgraphExecuteDoneResultOnNext[] = [];
              const onEndHooks: OnSubgraphExecuteDoneResultOnEnd[] = [];

              for (const executeDoneResult of executeDoneResults) {
                if (executeDoneResult.onNext) {
                  onNextHooks.push(executeDoneResult.onNext);
                }
                if (executeDoneResult.onEnd) {
                  onEndHooks.push(executeDoneResult.onEnd);
                }
              }

              if (onNextHooks.length === 0 && onEndHooks.length === 0) {
                return currentResult;
              }

              return mapAsyncIterator(
                currentResult,
                (currentResult) =>
                  mapMaybePromise(
                    iterateAsync(onNextHooks, (onNext) =>
                      onNext({
                        result: currentResult,
                        setResult: (res) => {
                          execReqLogger?.debug('overriding result with: ', res);

                          currentResult = res;
                        },
                      }),
                    ),
                    () => currentResult,
                  ),
                undefined,
                () =>
                  onEndHooks.length === 0
                    ? undefined
                    : iterateAsync(onEndHooks, (onEnd) => onEnd()),
              );
            },
          );
        });
      },
    );
  };
}

export interface UnifiedGraphPlugin<TContext> {
  onSubgraphExecute?: OnSubgraphExecuteHook<TContext>;
  onDelegationPlan?: OnDelegationPlanHook<TContext>;
  onDelegationStageExecute?: OnDelegationStageExecuteHook<TContext>;
}

export type OnSubgraphExecuteHook<TContext = any> = (
  payload: OnSubgraphExecutePayload<TContext>,
) => MaybePromise<Maybe<OnSubgraphExecuteDoneHook | void>>;

export interface OnSubgraphExecutePayload<TContext> {
  subgraph: GraphQLSchema;
  subgraphName: string;
  transportEntry?: TransportEntry;
  executionRequest: ExecutionRequest<any, TContext>;
  setExecutionRequest(executionRequest: ExecutionRequest): void;
  executor: Executor;
  setExecutor(executor: Executor): void;
  requestId?: string;
  logger?: Logger;
}

export interface OnSubgraphExecuteDonePayload {
  result: AsyncIterable<ExecutionResult> | ExecutionResult;
  setResult(result: AsyncIterable<ExecutionResult> | ExecutionResult): void;
}

export type OnSubgraphExecuteDoneHook = (
  payload: OnSubgraphExecuteDonePayload,
) => MaybePromise<Maybe<OnSubgraphExecuteDoneResult | void>>;

export type OnSubgraphExecuteDoneResultOnNext = (
  payload: OnSubgraphExecuteDoneOnNextPayload,
) => MaybePromise<void>;

export interface OnSubgraphExecuteDoneOnNextPayload {
  result: ExecutionResult;
  setResult(result: ExecutionResult): void;
}

export type OnSubgraphExecuteDoneResultOnEnd = () => MaybePromise<void>;

export type OnSubgraphExecuteDoneResult = {
  onNext?: OnSubgraphExecuteDoneResultOnNext;
  onEnd?: OnSubgraphExecuteDoneResultOnEnd;
};

export type OnDelegationPlanHook<TContext> = (
  payload: OnDelegationPlanHookPayload<TContext>,
) => Maybe<OnDelegationPlanDoneHook | void>;

export interface OnDelegationPlanHookPayload<TContext> {
  supergraph: GraphQLSchema;
  subgraph: string;
  sourceSubschema: Subschema<any, any, any, TContext>;
  typeName: string;
  variables: Record<string, any>;
  fragments: Record<string, FragmentDefinitionNode>;
  fieldNodes: SelectionNode[];
  context: TContext;
  requestId?: string;
  logger?: Logger;
  info?: GraphQLResolveInfo;
  delegationPlanBuilder: DelegationPlanBuilder;
  setDelegationPlanBuilder(delegationPlanBuilder: DelegationPlanBuilder): void;
}

export type OnDelegationPlanDoneHook = (
  payload: OnDelegationPlanDonePayload,
) => Maybe<void>;

export interface OnDelegationPlanDonePayload {
  delegationPlan: ReturnType<DelegationPlanBuilder>;
  setDelegationPlan: (
    delegationPlan: ReturnType<DelegationPlanBuilder>,
  ) => void;
}

export type OnDelegationStageExecuteHook<TContext> = (
  payload: OnDelegationStageExecutePayload<TContext>,
) => Maybe<OnDelegationStageExecuteDoneHook>;

export interface OnDelegationStageExecutePayload<TContext> {
  object: any;
  context: TContext;
  info: GraphQLResolveInfo;
  subgraph: string;
  subschema: Subschema<any, any, any, TContext>;
  selectionSet: SelectionSetNode;
  key?: any;
  type: GraphQLOutputType;

  resolver: MergedTypeResolver<TContext>;
  setResolver: (resolver: MergedTypeResolver<TContext>) => void;

  typeName: string;

  requestId?: string;
  logger?: Logger;
}

export type OnDelegationStageExecuteDoneHook = (
  payload: OnDelegationStageExecuteDonePayload,
) => void;

export interface OnDelegationStageExecuteDonePayload {
  result: any;
  setResult: (result: any) => void;
}

export function compareSchemas(
  a: DocumentNode | string | GraphQLSchema,
  b: DocumentNode | string | GraphQLSchema,
) {
  let aStr: string;
  if (typeof a === 'string') {
    aStr = a;
  } else if (isDocumentNode(a)) {
    aStr = print(a);
  } else {
    aStr = printSchemaWithDirectives(a);
  }
  let bStr: string;
  if (typeof b === 'string') {
    bStr = b;
  } else if (isDocumentNode(b)) {
    bStr = print(b);
  } else {
    bStr = printSchemaWithDirectives(b);
  }
  return aStr === bStr;
}

// TODO: Fix this in GraphQL Tools
export function compareSubgraphNames(name1: string, name2: string) {
  return constantCase(name1) === constantCase(name2);
}

export function wrapMergedTypeResolver<TContext extends Record<string, any>>(
  originalResolver: MergedTypeResolver<TContext>,
  typeName: string,
  onDelegationStageExecuteHooks: OnDelegationStageExecuteHook<TContext>[],
  baseLogger?: Logger,
): MergedTypeResolver<TContext> {
  return (object, context, info, subschema, selectionSet, key, type) => {
    let logger = baseLogger;
    let requestId: string | undefined;
    if (logger && context['request']) {
      requestId = requestIdByRequest.get(context['request']);
      if (requestId) {
        logger = logger.child(requestId);
      }
    }
    if (subschema.name) {
      logger = logger?.child(subschema.name);
    }
    let resolver = originalResolver as MergedTypeResolver<TContext>;
    function setResolver(newResolver: MergedTypeResolver<TContext>) {
      resolver = newResolver;
    }
    const onDelegationStageExecuteDoneHooks: OnDelegationStageExecuteDoneHook[] =
      [];
    for (const onDelegationStageExecute of onDelegationStageExecuteHooks) {
      const onDelegationStageExecuteDone = onDelegationStageExecute({
        object,
        context: context as TContext,
        info,
        subgraph: subschema.name!,
        subschema: subschema as Subschema<any, any, any, TContext>,
        selectionSet,
        key,
        typeName,
        type,
        requestId,
        logger,
        resolver,
        setResolver,
      });
      if (onDelegationStageExecuteDone) {
        onDelegationStageExecuteDoneHooks.push(onDelegationStageExecuteDone);
      }
    }
    return mapMaybePromise(
      resolver(
        object,
        context as TContext,
        info,
        subschema as Subschema<any, any, any, TContext>,
        selectionSet,
        key,
        type,
      ),
      (result) => {
        function setResult(newResult: any) {
          result = newResult;
        }
        for (const onDelegationStageExecuteDone of onDelegationStageExecuteDoneHooks) {
          onDelegationStageExecuteDone({
            result,
            setResult,
          });
        }
        return result;
      },
    );
  };
}

// Taken from https://stackoverflow.com/questions/8211744/convert-time-interval-given-in-seconds-into-more-human-readable-form
export function millisecondsToStr(milliseconds: number): string {
  // TIP: to find current time in milliseconds, use:
  // current_time_milliseconds = new Date().getTime();

  function numberEnding(number: number) {
    return number > 1 ? 's' : '';
  }

  let temp = Math.floor(milliseconds / 1000);
  const days = Math.floor((temp %= 31536000) / 86400);
  if (days) {
    return days + ' day' + numberEnding(days);
  }
  const hours = Math.floor((temp %= 86400) / 3600);
  if (hours) {
    return hours + ' hour' + numberEnding(hours);
  }
  const minutes = Math.floor((temp %= 3600) / 60);
  if (minutes) {
    return minutes + ' minute' + numberEnding(minutes);
  }
  const seconds = temp % 60;
  if (seconds) {
    return seconds + ' second' + numberEnding(seconds);
  }
  return 'less than a second'; //'just now' //or other string you like;
}
