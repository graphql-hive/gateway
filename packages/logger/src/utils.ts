import { LogLevel } from './Logger';

/** Context can be any JavaScript object to which a property can be assigned; */
export type Context = Object;

export type AttributeValue =
  | string
  | number
  | boolean
  | { [key: PropertyKey]: AttributeValue }
  | AttributeValue[]
  | Object // redundant, but this will allow _any_ object be the value
  | null
  | undefined
  | (() => AttributeValue); // lazy attribute

export type Attributes = Record<PropertyKey, AttributeValue>;

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
      return {
        name: val.name,
        message: val.message,
        stack: val.stack,
      };
    }
    return val;
  });
}
