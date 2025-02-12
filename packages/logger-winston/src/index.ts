import type {
  LazyLoggerMessage,
  Logger as MeshLogger,
} from '@graphql-mesh/types';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import type { Logger as WinstonLogger } from 'winston';

function prepareArgs(messageArgs: LazyLoggerMessage[]) {
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
  return [message, ...extras] as const;
}

class WinstonLoggerAdapter implements MeshLogger, Disposable {
  public name?: string;
  constructor(
    private winstonLogger: WinstonLogger,
    private meta: Record<string, any> = {},
  ) {
    if (meta['name']) {
      this.name = meta['name'];
    }
  }
  log(...args: any[]) {
    if (this.winstonLogger.isInfoEnabled()) {
      this.winstonLogger.info(...prepareArgs(args));
    }
  }
  info(...args: any[]) {
    if (this.winstonLogger.isInfoEnabled()) {
      this.winstonLogger.info(...prepareArgs(args));
    }
  }
  warn(...args: any[]) {
    if (this.winstonLogger.isWarnEnabled()) {
      this.winstonLogger.warn(...prepareArgs(args));
    }
  }
  error(...args: any[]) {
    if (this.winstonLogger.isErrorEnabled()) {
      this.winstonLogger.error(...prepareArgs(args));
    }
  }
  debug(...lazyArgs: LazyLoggerMessage[]) {
    if (this.winstonLogger.isDebugEnabled()) {
      this.winstonLogger.debug(...prepareArgs(lazyArgs));
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
    return new WinstonLoggerAdapter(this.winstonLogger.child(nameOrMeta), {
      ...this.meta,
      ...nameOrMeta,
    });
  }
  [DisposableSymbols.dispose]() {
    return this.winstonLogger.close();
  }
}

export function createLoggerFromWinston(
  winstonLogger: WinstonLogger,
): WinstonLoggerAdapter {
  return new WinstonLoggerAdapter(winstonLogger);
}
