import { LogLevel } from './logger';

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
  attrs: MaybeLazy<Attributes | undefined> | undefined,
  functionUnwrapDepth = 0,
): Attributes | undefined {
  if (functionUnwrapDepth > 3) {
    throw new Error('Too much recursion while unwrapping function attributes');
  }

  if (!attrs) {
    return undefined;
  }

  if (typeof attrs === 'function') {
    return parseAttrs(attrs(), functionUnwrapDepth + 1);
  }

  if (Array.isArray(attrs)) {
    return attrs.map((val) => unwrapAttrVal(val));
  }

  if (isPlainObject(attrs)) {
    const unwrapped: Attributes = {};
    for (const key of Object.keys(attrs)) {
      const val = attrs[key as keyof typeof attrs];
      unwrapped[key] = unwrapAttrVal(val);
    }
    return unwrapped;
  }

  return objectifyClass(attrs);
}

function unwrapAttrVal(
  attr: AttributeValue,
  visited = new WeakSet(),
): AttributeValue {
  if (!attr) {
    return attr;
  }

  if (isPrimitive(attr)) {
    return attr;
  }

  if (typeof attr === 'function') {
    return `[Function: ${attr.name || '(anonymous)'}]`;
  }

  if (visited.has(attr)) {
    return '[Circular]';
  }
  visited.add(attr);

  if (Array.isArray(attr)) {
    return attr.map((val) => unwrapAttrVal(val));
  }

  if (isPlainObject(attr)) {
    const unwrapped: { [key: string | number]: AttributeValue } = {};
    for (const key of Object.keys(attr)) {
      const val = attr[key as keyof typeof attr];
      unwrapped[key] = unwrapAttrVal(val, visited);
    }
    return unwrapped;
  }

  // very likely an instance of something, dont unwrap it
  return objectifyClass(attr);
}

function isPrimitive(val: unknown): val is string | number | boolean {
  return val !== Object(val);
}

const nodejsCustomInspectSy = Symbol.for('nodejs.util.inspect.custom');

function objectifyClass(val: unknown): Record<string, unknown> {
  if (
    // simply empty
    !val ||
    // Object.create(null)
    Object(val).__proto__ == null
  ) {
    return {};
  }
  if (
    typeof val === 'object' &&
    'toJSON' in val &&
    typeof val.toJSON === 'function'
  ) {
    // if the object has a toJSON method, use it - always
    return val.toJSON();
  }
  if (
    typeof val === 'object' &&
    nodejsCustomInspectSy in val &&
    typeof val[nodejsCustomInspectSy] === 'function'
  ) {
    // > Custom [util.inspect.custom](depth, opts, inspect) functions typically return a string but may return a value of any type that will be formatted accordingly by util.inspect().
    return {
      [nodejsCustomInspectSy.toString()]: unwrapAttrVal(
        val[nodejsCustomInspectSy](Infinity, {}),
      ),
      class: val.constructor.name,
    };
  }
  const props: Record<string, unknown> = {};
  for (const propName of Object.getOwnPropertyNames(val)) {
    props[propName] = unwrapAttrVal(val[propName as keyof typeof val]);
  }
  for (const protoPropName of Object.getOwnPropertyNames(
    Object.getPrototypeOf(val),
  )) {
    const propVal = val[protoPropName as keyof typeof val];
    if (typeof propVal === 'function') {
      continue;
    }
    props[protoPropName] = unwrapAttrVal(propVal);
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

export function shallowMergeAttributes(
  target: Attributes | undefined,
  source: Attributes | undefined,
): Attributes | undefined {
  switch (true) {
    case Array.isArray(source) && Array.isArray(target):
      // both are arrays
      return [...target, ...source];
    case Array.isArray(source):
      // only "source" is an array
      return target ? [target, ...source] : source;
    case Array.isArray(target):
      // only "target" is an array
      return source ? [...target, source] : target;
    case !!(target || source):
      // neither are arrays, but at least one is an object
      return { ...target, ...source };
    default:
      // neither are provided
      return undefined;
  }
}

/** Checks whether the value is a plan object and not an instance of any other class.  */
function isPlainObject(val: unknown): val is Object {
  return (
    Object(val).constructor === Object &&
    Object.getPrototypeOf(val) === Object.prototype
  );
}
