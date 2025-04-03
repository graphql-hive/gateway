import { Logger } from './Logger';

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

  debug(...lazyArgs: LazyLoggerMessage[]) {
    const [maybeMsgOrArg, ...restArgs] = handleLazyMessage(lazyArgs);
    if (typeof maybeMsgOrArg === 'string') {
      this.#logger.debug(restArgs, maybeMsgOrArg);
    } else {
      if (restArgs.length) {
        this.#logger.debug([maybeMsgOrArg, ...restArgs]);
      } else {
        this.#logger.debug(maybeMsgOrArg);
      }
    }
  }

  child(name: string | Record<string, string | number>): LegacyLogger {
    name = stringifyName(name);
    if (this.#logger.prefix?.includes(name)) {
      // TODO: why do we do this?
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
