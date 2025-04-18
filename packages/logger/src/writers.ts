import fastSafeStringify from 'fast-safe-stringify';
import { LogLevel } from './Logger';
import { Attributes, logLevelToString, truthyEnv } from './utils';

export function jsonStringify(val: unknown, pretty?: boolean): string {
  return fastSafeStringify(val, undefined, pretty ? 2 : undefined);
}

// TODO: decide whether logwriters need to have a flush method too or not (the logger will flush any pending writes)

export interface LogWriter {
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void | Promise<void>;
}

export class MemoryLogWriter implements LogWriter {
  public logs: { level: LogLevel; msg?: string; attrs?: unknown }[] = [];
  write(
    level: LogLevel,
    attrs: Record<string, any>,
    msg: string | null | undefined,
  ): void {
    this.logs.push({
      level,
      ...(msg ? { msg } : {}),
      ...(attrs ? { attrs } : {}),
    });
  }
}

const asciMap = {
  timestamp: '\x1b[90m', // bright black
  trace: '\x1b[36m', // cyan
  debug: '\x1b[90m', // bright black
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[41;39m', // red; white
  message: '\x1b[1m', // bold
  reset: '\x1b[0m', // reset
};

export class ConsoleLogWriter implements LogWriter {
  #nocolor =
    // no color if we're running in browser-like (edge) environments
    // TODO: is this the most accurate way to detect it?
    typeof process === 'undefined' ||
    // no color if https://no-color.org/
    truthyEnv('NO_COLOR');
  color(style: keyof typeof asciMap, text: string | null | undefined) {
    if (!text) {
      return text;
    }
    if (this.#nocolor) {
      return text;
    }
    return asciMap[style] + text + asciMap.reset;
  }
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    console[level === 'trace' ? 'debug' : level](
      [
        this.color('timestamp', new Date().toISOString()),
        this.color(level, logLevelToString(level)),
        this.color('message', msg),
        // we want to stringify because we want all properties (even nested ones)be properly displayed
        attrs ? jsonStringify(attrs, truthyEnv('LOG_JSON_PRETTY')) : undefined,
      ].join(' '),
    );
  }
}

export class JSONLogWriter implements LogWriter {
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    console.log(
      jsonStringify(
        {
          ...attrs,
          level,
          ...(msg ? { msg } : {}),
          timestamp: new Date().toISOString(),
        },
        truthyEnv('LOG_JSON_PRETTY'),
      ),
    );
  }
}
