import type {
  LazyLoggerMessage,
  Logger as MeshLogger,
} from '@graphql-mesh/types';
import { LogLevel } from '@graphql-mesh/utils';
import type pino from 'pino';

type PinoWithChild = pino.BaseLogger & {
  child: (meta: any) => PinoWithChild;
};

function prepareArgs(messageArgs: LazyLoggerMessage[]): Parameters<pino.LogFn> {
  const flattenedMessageArgs = messageArgs
    .flat(Infinity)
    .flatMap((messageArg) => {
      if (typeof messageArg === 'function') {
        messageArg = messageArg();
      }
      if (messageArg?.toJSON) {
        messageArg = messageArg.toJSON();
      }
      if (messageArg instanceof AggregateError) {
        return messageArg.errors;
      }
      return messageArg;
    });
  let message: string = '';
  const extras: any[] = [];
  for (let messageArg of flattenedMessageArgs) {
    if (messageArg == null) {
      continue;
    }
    const typeofMessageArg = typeof messageArg;
    if (
      typeofMessageArg === 'string' ||
      typeofMessageArg === 'number' ||
      typeofMessageArg === 'boolean'
    ) {
      message = message ? message + ', ' + messageArg : messageArg;
    } else if (typeofMessageArg === 'object') {
      extras.push(messageArg);
    }
  }
  if (extras.length > 0) {
    // @ts-expect-error - pino accepts an array of objects as extra metadata
    return [Object.assign({}, ...extras), message];
  }
  return [message];
}

class PinoLoggerAdapter implements MeshLogger {
  public name?: string;
  constructor(
    private pinoLogger: PinoWithChild,
    private meta: Record<string, any> = {},
  ) {
    if (meta['name']) {
      this.name = meta['name'];
    }
  }

  get level(): LogLevel {
    if (this.pinoLogger.level) {
      return LogLevel[this.pinoLogger.level as keyof typeof LogLevel];
    }
    return LogLevel.silent;
  }

  set level(level: LogLevel) {
    this.pinoLogger.level = LogLevel[level];
  }

  isLevelEnabled(level: LogLevel) {
    if (this.level > level) {
      return false;
    }
    return true;
  }

  log(...args: any[]) {
    if (this.isLevelEnabled(LogLevel.info)) {
      this.pinoLogger.info(...prepareArgs(args));
    }
  }
  info(...args: any[]) {
    if (this.isLevelEnabled(LogLevel.info)) {
      this.pinoLogger.info(...prepareArgs(args));
    }
  }
  warn(...args: any[]) {
    if (this.isLevelEnabled(LogLevel.warn)) {
      this.pinoLogger.warn(...prepareArgs(args));
    }
  }
  error(...args: any[]) {
    if (this.isLevelEnabled(LogLevel.error)) {
      this.pinoLogger.error(...prepareArgs(args));
    }
  }
  debug(...lazyArgs: LazyLoggerMessage[]) {
    if (this.isLevelEnabled(LogLevel.debug)) {
      this.pinoLogger.debug(...prepareArgs(lazyArgs));
    }
  }
  child(nameOrMeta: string | Record<string, string | number>) {
    if (typeof nameOrMeta === 'string') {
      nameOrMeta = {
        name: this.name
          ? this.name.includes(nameOrMeta)
            ? this.name
            : `${this.name}, ${nameOrMeta}`
          : nameOrMeta,
      };
    }
    return new PinoLoggerAdapter(this.pinoLogger.child(nameOrMeta), {
      ...this.meta,
      ...nameOrMeta,
    });
  }
}

export function createLoggerFromPino(
  pinoLogger: PinoWithChild,
): PinoLoggerAdapter {
  return new PinoLoggerAdapter(pinoLogger);
}
