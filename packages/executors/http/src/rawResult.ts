import type { ExecutionRequest, ExecutionResult } from '@graphql-tools/utils';
import { TextDecoder } from '@whatwg-node/fetch';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';

/**
 * Decides whether a response body can be kept as bytes. It is called once per
 * response with the complete body and must return `true` only when the body is
 * a JSON object whose only member is a non-null `data`.
 */
export type RawResultAcceptor = (body: Uint8Array) => boolean;

/**
 * Opt-in for a raw result, set on the execution request:
 * `request[RAW_RESULT_ACCEPTOR] = (body) => boolean`.
 *
 * When the acceptor accepts the body, the executor does not parse it. The
 * result exposes `data` as a getter that parses on first read, so every reader
 * gets the object it gets today, and {@link getRawResultBody} returns the
 * bytes for as long as nobody has read or replaced `data`.
 * When the acceptor rejects the body, the result is parsed as usual.
 *
 * Registered symbol, so that other packages can use it without importing this one.
 */
export const RAW_RESULT_ACCEPTOR = Symbol.for(
  '@graphql-tools/executor-http:rawResultAcceptor',
);

const RAW_RESULT_BODY = Symbol.for(
  '@graphql-tools/executor-http:rawResultBody',
);

interface RawResult extends ExecutionResult {
  [RAW_RESULT_BODY]?: Uint8Array;
}

// which acceptor accepted the body of a raw result, to skip accepting twice when sharing
const acceptorByResult = new WeakMap<ExecutionResult, RawResultAcceptor>();

export function getRawResultAcceptor(
  request: ExecutionRequest,
): RawResultAcceptor | undefined {
  const acceptor = (request as any)[RAW_RESULT_ACCEPTOR];
  return typeof acceptor === 'function' ? acceptor : undefined;
}

/**
 * The unparsed response body of a raw result, or `undefined` when the result
 * is not raw or its `data` has already been read or replaced.
 */
export function getRawResultBody(
  result: ExecutionResult | null | undefined,
): Uint8Array | undefined {
  return (result as RawResult | null | undefined)?.[RAW_RESULT_BODY];
}

let textDecoder: InstanceType<typeof TextDecoder> | undefined;
function decode(body: Uint8Array): string {
  textDecoder ||= new TextDecoder();
  return textDecoder.decode(body);
}

function createRawResult(
  body: Uint8Array,
  acceptor: RawResultAcceptor,
): ExecutionResult {
  const result: RawResult = {};
  // Once somebody holds the parsed data it may be changed in place, so the
  // bytes stop representing the result from the first read on.
  function settle(data: any) {
    result[RAW_RESULT_BODY] = undefined;
    Object.defineProperty(result, 'data', {
      value: data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return data;
  }
  Object.defineProperty(result, RAW_RESULT_BODY, {
    value: body,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(result, 'data', {
    enumerable: true,
    configurable: true,
    get: () => settle(JSON.parse(decode(body)).data),
    set: settle,
  });
  acceptorByResult.set(result, acceptor);
  return result;
}

type BodyReader = {
  bytes?: () => MaybePromise<Uint8Array>;
  arrayBuffer?: () => MaybePromise<ArrayBuffer>;
  text: () => MaybePromise<string>;
};

/**
 * Reads the response body once. Returns a raw result when the acceptor accepts
 * the bytes, otherwise the body as text for the regular parsing path.
 */
export function readRawResultOrText(
  response: BodyReader,
  acceptor: RawResultAcceptor,
): MaybePromise<ExecutionResult | string> {
  if (
    typeof response.bytes !== 'function' &&
    typeof response.arrayBuffer !== 'function'
  ) {
    return response.text();
  }
  return handleMaybePromise(
    () =>
      typeof response.bytes === 'function'
        ? response.bytes()
        : response.arrayBuffer!(),
    (bodyOrBuffer) => {
      const body =
        bodyOrBuffer instanceof Uint8Array
          ? bodyOrBuffer
          : new Uint8Array(bodyOrBuffer);
      return acceptor(body) ? createRawResult(body, acceptor) : decode(body);
    },
  );
}

/**
 * A raw result for one more consumer of a deduplicated in-flight request.
 * The bytes are immutable, so every consumer gets its own result over them
 * instead of a deep clone; a consumer whose acceptor does not accept the body
 * (or that has none) gets its own parsed copy.
 */
export function shareRawResult(
  body: Uint8Array,
  result: ExecutionResult,
  acceptor: RawResultAcceptor | undefined,
): ExecutionResult {
  if (
    acceptor &&
    (acceptorByResult.get(result) === acceptor || acceptor(body))
  ) {
    return createRawResult(body, acceptor);
  }
  return { data: JSON.parse(decode(body)).data };
}
