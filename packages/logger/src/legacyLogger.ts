import { Logger, LogLevel } from './logger';
import { shouldLog } from './utils';

// type comes from "@graphql-mesh/types" package, we're copying them over just to avoid including the whole package
export type LazyLoggerMessage = (() => any | any[]) | any;

/** @deprecated Please migrate to using the {@link Logger} instead.*/
export class LegacyLogger {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  static from(logger: Logger): LegacyLogger {
    return new LegacyLogger(logger);
  }

  #log(level: LogLevel, ...[maybeMsgOrArg, ...restArgs]: any[]) {
    if (typeof maybeMsgOrArg === 'string') {
      if (restArgs.length) {
        this.#logger.log(level, restArgs, maybeMsgOrArg);
      } else {
        this.#logger.log(level, maybeMsgOrArg);
      }
    } else {
      if (restArgs.length) {
        this.#logger.log(level, [maybeMsgOrArg, ...restArgs]);
      } else {
        this.#logger.log(level, maybeMsgOrArg);
      }
    }
  }

  log(...args: any[]) {
    this.#log('info', ...args);
  }

  warn(...args: any[]) {
    this.#log('warn', ...args);
  }

  info(...args: any[]) {
    this.#log('info', ...args);
  }

  error(...args: any[]) {
    this.#log('error', ...args);
  }

  debug(...lazyArgs: LazyLoggerMessage[]) {
    if (!shouldLog(this.#logger.level, 'debug')) {
      // we only return early here because only debug can have lazy logs
      return;
    }
    this.#log('debug', ...handleLazyMessage(lazyArgs));
  }

  child(name: string | Record<string, string | number>): LegacyLogger {
    name =
      stringifyName(name) +
      // append space if object is strigified to space out the prefix
      (typeof name === 'object' ? ' ' : '');
    if (this.#logger.prefix === name) {
      return this;
    }
    return LegacyLogger.from(this.#logger.child(name));
  }

  addPrefix(prefix: string | Record<string, string | number>): LegacyLogger {
    prefix = stringifyName(prefix);
    if (this.#logger.prefix?.includes(prefix)) {
      // TODO: why do we do this?
      return this;
    }
    return LegacyLogger.from(this.#logger.child(prefix));
  }
}

function stringifyName(name: string | Record<string, string | number>) {
  if (typeof name === 'string' || typeof name === 'number') {
    return `${name}`;
  }
  const names: string[] = [];
  for (const [key, value] of Object.entries(name)) {
    names.push(`${key}=${value}`);
  }
  return `${names.join(', ')}`;
}

function handleLazyMessage(lazyArgs: LazyLoggerMessage[]) {
  return lazyArgs.flat(Infinity).flatMap((arg) => {
    if (typeof arg === 'function') {
      return arg();
    }
    return arg;
  });
}
