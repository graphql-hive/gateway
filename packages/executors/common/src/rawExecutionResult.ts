import type { ExecutionRequest, ExecutionResult } from '@graphql-tools/utils';
import type { GraphQLError } from 'graphql';

/**
 * Set to `true` on an execution request to ask the executor for the response body as bytes, see
 * {@link createRawExecutionResult}. An executor that doesn't know it returns a parsed result.
 */
export const rawResponseSymbol = Symbol.for('graphql-tools.rawResponse');

/** Asks for the response of `request` as bytes, see {@link rawResponseSymbol}. */
export function requestRawResponse<T extends ExecutionRequest>(request: T): T {
  (request as unknown as Record<symbol, unknown>)[rawResponseSymbol] = true;
  return request;
}

export function wantsRawResponse(request: ExecutionRequest): boolean {
  return (
    (request as unknown as Record<symbol, unknown>)[rawResponseSymbol] === true
  );
}

interface RawResponse {
  /** The JSON body, `undefined` once the parsed `data` might have been changed. */
  bytes: Uint8Array | undefined;
  /** What the body parses to, once something needed it. */
  parsed: ExecutionResult | undefined;
  /** Applied to the errors when they're parsed. */
  errorTransforms: ((error: GraphQLError) => void)[];
  parse: (bytes: Uint8Array) => ExecutionResult;
}

const rawResponses = new WeakMap<ExecutionResult, RawResponse>();

/**
 * A result whose `data`, `errors` and `extensions` are parsed from `bytes`, the JSON body of the
 * response, only when read. Until `data` is read or set, {@link getRawResponseBytes} gives the
 * bytes, so a consumer that understands them never needs the parsed result.
 *
 * Reading `errors` parses the whole body, a consumer that only changes the errors should add an
 * {@link addRawErrorTransform} instead.
 */
export function createRawExecutionResult(
  bytes: Uint8Array,
  parse: (bytes: Uint8Array) => ExecutionResult,
): ExecutionResult {
  const raw: RawResponse = {
    bytes,
    parsed: undefined,
    errorTransforms: [],
    parse,
  };
  const materialize = () => {
    if (!raw.parsed) {
      raw.parsed = parse(bytes);
      for (const transform of raw.errorTransforms) {
        for (const error of raw.parsed.errors ?? []) {
          transform(error);
        }
      }
      raw.errorTransforms = [];
    }
    return raw.parsed;
  };
  const result = {} as ExecutionResult;
  for (const key of ['data', 'errors', 'extensions'] as const) {
    Object.defineProperty(result, key, {
      enumerable: true,
      configurable: true,
      get() {
        if (key === 'data') {
          // the reader may change it, the bytes wouldn't say the same anymore
          raw.bytes = undefined;
        }
        return materialize()[key];
      },
      set(value) {
        if (key === 'data') {
          raw.bytes = undefined;
        }
        (materialize() as Record<string, unknown>)[key] = value;
      },
    });
  }
  rawResponses.set(result, raw);
  return result;
}

/**
 * The JSON body of a result from {@link createRawExecutionResult}, when nothing read or set its
 * `data` yet. `undefined` for any other result.
 */
export function getRawResponseBytes(
  result: ExecutionResult,
): Uint8Array | undefined {
  return rawResponses.get(result)?.bytes;
}

/**
 * Another result over the same bytes, for another consumer of the same response, when nothing
 * read or set the `data` of `result` yet. Each one parses on its own, so their parsed values are
 * never shared. `undefined` for any other result.
 */
export function cloneRawExecutionResult(
  result: ExecutionResult,
): ExecutionResult | undefined {
  const raw = rawResponses.get(result);
  if (!raw?.bytes) {
    return undefined;
  }
  const clone = createRawExecutionResult(raw.bytes, raw.parse);
  rawResponses.get(clone)!.errorTransforms.push(...raw.errorTransforms);
  return clone;
}

/**
 * Changes every error of a result from {@link createRawExecutionResult} when its errors are
 * parsed, without parsing them now. Returns `false` for any other result, whose errors can be
 * changed right away.
 */
export function addRawErrorTransform(
  result: ExecutionResult,
  transform: (error: GraphQLError) => void,
): boolean {
  const raw = rawResponses.get(result);
  if (!raw) {
    return false;
  }
  if (raw.parsed) {
    // already parsed, its errors are there to change
    for (const error of raw.parsed.errors ?? []) {
      transform(error);
    }
  } else {
    raw.errorTransforms.push(transform);
  }
  return true;
}
