import { LogLevel } from './Logger';

export type AttributeValue =
  | string
  | number
  | boolean
  | { [key: string | number]: AttributeValue }
  | AttributeValue[]
  | Object // redundant, but this will allow _any_ object be the value
  | null
  | undefined
  | (() => AttributeValue); // lazy attribute

export type Attributes =
  | (() => Attributes)
  | AttributeValue[]
  | { [key: string | number]: AttributeValue };

export function logLevelToString(level: LogLevel): string {
  switch (level) {
    case 'trace':
      return 'TRC';
    case 'debug':
      return 'DBG';
    case 'info':
      return 'INF';
    case 'warn':
      return 'WRN';
    case 'error':
      return 'ERR';
    default:
      throw new Error(`Unknown log level "${level}"`);
  }
}

export function isPromise(val: unknown): val is Promise<any> {
  const obj = Object(val);
  return (
    typeof obj.then === 'function' &&
    typeof obj.catch === 'function' &&
    typeof obj.finally === 'function'
  );
}

/** An error safe JSON stringifyer. */
export function jsonStringify(val: unknown) {
  return JSON.stringify(val, (_key, val) => {
    if (val instanceof Error) {
      // TODO: also handle graphql errors, and maybe all other errors that can contain more properties
      return {
        name: val.name,
        message: val.message,
        stack: val.stack,
      };
    }
    return val;
  });
}

/** Recursivelly unwrapps the lazy attributes. */
export function unwrapAttrs(attrs: Attributes, depth = 0): Attributes {
  if (depth > 10) {
    throw new Error('Too much recursion while unwrapping function attributes');
  }

  if (typeof attrs === 'function') {
    return unwrapAttrs(attrs(), depth + 1);
  }

  const unwrapped: Attributes = {};
  for (const key of Object.keys(attrs)) {
    const val = attrs[key as keyof typeof attrs];
    unwrapped[key] = unwrapAttrVal(val, depth + 1);
  }
  return unwrapped;
}

function unwrapAttrVal(attr: AttributeValue, depth = 0): AttributeValue {
  if (depth > 10) {
    throw new Error(
      'Too much recursion while unwrapping function attribute values',
    );
  }

  if (!attr) {
    return attr;
  }

  if (isPrimitive(attr)) {
    return attr;
  }

  if (typeof attr === 'function') {
    return unwrapAttrVal(attr(), depth + 1);
  }

  // unwrap array items
  if (Array.isArray(attr)) {
    return attr.map((val) => unwrapAttrVal(val, depth + 1));
  }

  // plain object (not an instance of anything)
  // NOTE: is valnurable to `Symbol.toStringTag` pollution, but the user would be sabotaging themselves
  if (Object.prototype.toString.call(attr) === '[object Object]') {
    const unwrapped: { [key: string | number]: AttributeValue } = {};
    for (const key of Object.keys(attr)) {
      const val = attr[key as keyof typeof attr];
      unwrapped[key] = unwrapAttrVal(val, depth + 1);
    }
    return unwrapped;
  }

  // very likely an instance of something, dont unwrap it
  return attr;
}

function isPrimitive(val: unknown): val is string | number | boolean {
  return val !== Object(val);
}

export function getEnv(key: string): string | undefined {
  return (
    globalThis.process?.env?.[key] ||
    // @ts-expect-error can exist in wrangler and maybe other runtimes
    globalThis.env?.[key] ||
    // @ts-expect-error can exist in deno
    globalThis.Deno?.env?.get(key) ||
    // @ts-expect-error could be
    globalThis[key]
  );
}

export function truthyEnv(key: string): boolean {
  return ['1', 't', 'true', 'y', 'yes'].includes(
    getEnv(key)?.toLowerCase() || '',
  );
}
