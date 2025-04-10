import { LogLevel } from './Logger';

export type MaybeLazy<T> = T | (() => T);

export type AttributeValue = any;

export type Attributes =
  | AttributeValue[]
  | { [key: string | number]: AttributeValue };

export const logLevel: { [level in LogLevel]: number } = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export function shouldLog(
  setLevel: MaybeLazy<LogLevel | false>,
  loggingLevel: LogLevel,
): boolean {
  setLevel = typeof setLevel === 'function' ? setLevel() : setLevel;
  return (
    setLevel !== false && // logging is not disabled
    logLevel[setLevel] <= logLevel[loggingLevel] // and set log level is less than or equal to logging level
  );
}

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

/** Recursivelly unwrapps the lazy attributes and parses instances of classes. */
export function parseAttrs(
  attrs: MaybeLazy<Attributes>,
  depth = 0,
): Attributes {
  if (depth > 10) {
    throw new Error('Too much recursion while unwrapping function attributes');
  }

  if (typeof attrs === 'function') {
    return parseAttrs(attrs(), depth + 1);
  }

  if (Array.isArray(attrs)) {
    return attrs.map((val) => unwrapAttrVal(val, depth + 1));
  }

  if (Object.prototype.toString.call(attrs) === '[object Object]') {
    const unwrapped: Attributes = {};
    for (const key of Object.keys(attrs)) {
      const val = attrs[key as keyof typeof attrs];
      unwrapped[key] = unwrapAttrVal(val, depth + 1);
    }
    return unwrapped;
  }

  return objectifyClass(attrs);
}

function unwrapAttrVal(
  attr: MaybeLazy<AttributeValue>,
  depth = 0,
): AttributeValue {
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
  return objectifyClass(attr);
}

function isPrimitive(val: unknown): val is string | number | boolean {
  return val !== Object(val);
}

function objectifyClass(val: unknown): Record<string, unknown> {
  if (!val) {
    // TODO: this should never happen, objectify class should not be called on empty values
    return {};
  }
  const props: Record<string, unknown> = {};
  for (const propName of Object.getOwnPropertyNames(val)) {
    props[propName] = val[propName as keyof typeof val];
  }
  for (const protoPropName of Object.getOwnPropertyNames(
    Object.getPrototypeOf(val),
  )) {
    const propVal = val[protoPropName as keyof typeof val];
    if (typeof propVal === 'function') {
      continue;
    }
    props[protoPropName] = propVal;
  }
  return {
    ...props,
    class: val.constructor.name,
  };
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
