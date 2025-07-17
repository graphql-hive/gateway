import type { LazyLoggerMessage, Logger } from '@graphql-mesh/types';
import { LogLevel } from '@graphql-mesh/utils';
import { getEnvStr } from '~internal/env';
import { inspect } from 'cross-inspect';

export interface JSONLoggerOptions {
  name?: string;
  meta?: Record<string, any>;
  level?: LogLevel;
  console?: Console;
}
function truthy(val: unknown) {
  return (
    val === true ||
    val === 1 ||
    ['1', 't', 'true', 'y', 'yes'].includes(String(val))
  );
}

declare global {
  var DEBUG: string;
}

export class JSONLogger implements Logger {
  name?: string;
  meta: Record<string, any>;
  logLevel: LogLevel;
  console: Console;
  constructor(opts?: JSONLoggerOptions) {
    this.name = opts?.name;
    this.console = opts?.console || console;
    this.meta = opts?.meta || {};
    const debugStrs = [getEnvStr('DEBUG'), globalThis.DEBUG];
    if (opts?.level != null) {
      this.logLevel = opts.level;
    } else {
      this.logLevel = LogLevel.info;
      for (const debugStr of debugStrs) {
        if (debugStr) {
          if (truthy(debugStr)) {
            this.logLevel = LogLevel.debug;
            break;
          }
          if (opts?.name) {
            if (debugStr?.toString()?.includes(opts.name)) {
              this.logLevel = LogLevel.debug;
              break;
            }
          }
        }
      }
    }
  }

  log(...messageArgs: LazyLoggerMessage[]) {
    if (this.logLevel > LogLevel.info) {
      return;
    }
    const finalMessage = this.prepareFinalMessage('info', messageArgs);
    this.console.log(finalMessage);
  }

  warn(...messageArgs: LazyLoggerMessage[]) {
    if (this.logLevel > LogLevel.warn) {
      return;
    }
    const finalMessage = this.prepareFinalMessage('warn', messageArgs);
    this.console.warn(finalMessage);
  }

  info(...messageArgs: LazyLoggerMessage[]) {
    if (this.logLevel > LogLevel.info) {
      return;
    }
    const finalMessage = this.prepareFinalMessage('info', messageArgs);
    this.console.info(finalMessage);
  }

  error(...messageArgs: LazyLoggerMessage[]) {
    if (this.logLevel > LogLevel.error) {
      return;
    }
    const finalMessage = this.prepareFinalMessage('error', messageArgs);
    this.console.error(finalMessage);
  }

  debug(...messageArgs: LazyLoggerMessage[]) {
    if (this.logLevel > LogLevel.debug) {
      return;
    }
    const finalMessage = this.prepareFinalMessage('debug', messageArgs);
    this.console.debug(finalMessage);
  }

  child(nameOrMeta: string | Record<string, string | number>) {
    let newName: string | undefined;
    let newMeta: Record<string, any>;
    if (typeof nameOrMeta === 'string') {
      newName = this.name ? `${this.name}, ${nameOrMeta}` : nameOrMeta;
      newMeta = this.meta;
    } else if (typeof nameOrMeta === 'object') {
      newName = this.name;
      newMeta = { ...this.meta, ...nameOrMeta };
    } else {
      throw new Error('Invalid argument type');
    }
    return new JSONLogger({
      name: newName,
      meta: newMeta,
      level: this.logLevel,
      console: this.console,
    });
  }

  addPrefix(prefix: string | Record<string, string | number>) {
    if (typeof prefix === 'string') {
      this.name = this.name ? `${this.name}, ${prefix}` : prefix;
    } else if (typeof prefix === 'object') {
      this.meta = { ...this.meta, ...prefix };
    }
    return this;
  }

  private prepareFinalMessage(level: string, messageArgs: LazyLoggerMessage[]) {
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
    const finalMessage: Record<string, any> = {
      ...this.meta,
      level,
      time: new Date().toISOString(),
    };
    if (this.name) {
      finalMessage['name'] = this.name;
    }
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
        finalMessage['msg'] = finalMessage['msg']
          ? finalMessage['msg'] + ', ' + messageArg
          : messageArg;
      } else if (typeofMessageArg === 'object') {
        if (messageArg instanceof Error) {
          finalMessage['msg'] = finalMessage['msg']
            ? finalMessage['msg'] + ', ' + messageArg.message
            : messageArg.message;
          finalMessage['stack'] = messageArg.stack;
        } else if (
          Object.prototype.toString.call(messageArg).startsWith('[object')
        ) {
          Object.assign(finalMessage, messageArg);
        } else {
          extras.push(messageArg);
        }
      }
    }
    if (extras.length) {
      if (extras.length === 1) {
        finalMessage['extras'] = inspect(extras[0]);
      } else {
        finalMessage['extras'] = extras.map((extra) => inspect(extra));
      }
    }
    return JSON.stringify(finalMessage);
  }
}
