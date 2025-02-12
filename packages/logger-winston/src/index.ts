import { DisposableSymbols } from '@whatwg-node/disposablestack';
import type {
  LazyLoggerMessage,
  Logger as MeshLogger,
} from '@graphql-mesh/types';
import type { Logger as WinstonLogger } from 'winston';

function prepareArgs(lazyArgs: LazyLoggerMessage[]) {
  const flattenedArgs = lazyArgs
    .flatMap((lazyArg) => (typeof lazyArg === 'function' ? lazyArg() : lazyArg))
    .flat(Infinity)
    .map((arg) => {
      if (typeof arg === 'string') {
        try {
          arg = JSON.parse(arg);
        } catch (e) {
          // Do nothing
        }
      }
      return arg;
    });
  if (flattenedArgs.length === 1) {
    return flattenedArgs[0];
  }
  return flattenedArgs;
}

class WinstonLoggerAdapter implements MeshLogger, Disposable {
  constructor(
    private winstonLogger: WinstonLogger,
    public names: string[] = [],
  ) {}
  get name() {
    return this.names.join(' - ');
  }
  log(...args: any[]) {
    if (this.winstonLogger.isInfoEnabled()) {
      this.winstonLogger.info(prepareArgs(args));
    }
  }
  info(...args: any[]) {
    if (this.winstonLogger.isInfoEnabled()) {
      this.winstonLogger.info(prepareArgs(args));
    }
  }
  warn(...args: any[]) {
    if (this.winstonLogger.isWarnEnabled()) {
      this.winstonLogger.warn(prepareArgs(args));
    }
  }
  error(...args: any[]) {
    if (this.winstonLogger.isErrorEnabled()) {
      this.winstonLogger.error(prepareArgs(args));
    }
  }
  debug(...lazyArgs: LazyLoggerMessage[]) {
    if (this.winstonLogger.isDebugEnabled()) {
      this.winstonLogger.debug(prepareArgs(lazyArgs));
    }
  }
  child(name: string) {
    const newName = [...new Set([...this.names, name])];
    const childWinston = this.winstonLogger.child({ name: newName });
    return new WinstonLoggerAdapter(childWinston, newName);
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
