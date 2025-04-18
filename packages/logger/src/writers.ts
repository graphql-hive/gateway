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
    attrs: Attributes | null | undefined,
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
        attrs ? this.stringifyAttrs(attrs) : undefined,
      ].join(' '),
    );
  }
  stringifyAttrs(attrs: Attributes): string {
    let log = '\n';

    for (const line of jsonStringify(attrs, true).split('\n')) {
      // remove the first and last line the opening and closing brackets
      if (line === '{' || line === '}' || line === '[' || line === ']') {
        continue;
      }

      let formattedLine = line;

      // remove the quotes from the keys and remove the opening bracket
      // TODO: make sure keys with quotes are preserved
      formattedLine = formattedLine.replace(/"([^"]+)":/, '$1:');

      // replace all escaped new lines with a new line and append the indentation of the line
      let indentationSize = line.match(/^\s*/)?.[0]?.length || 0;
      if (indentationSize) indentationSize++;

      // TODO: error stack traces will have 4 spaces of indentation, should we sanitize all 4 spaces / tabs to 2 space indentation?
      formattedLine = formattedLine.replaceAll(
        /\\n/g,
        '\n' + [...Array(indentationSize)].join(' '),
      );

      // remove the ending comma
      formattedLine = formattedLine.replace(/,$/, '');

      log += formattedLine + '\n';
    }

    // remove last new line
    log = log.slice(0, -1);

    return log;
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
