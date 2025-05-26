import { LogLevel } from '../logger';
import { Attributes, logLevelToString, truthyEnv } from '../utils';
import { jsonStringify, LogWriter } from './common';

const asciMap = {
  timestamp: '\x1b[90m', // bright black
  trace: '\x1b[36m', // cyan
  debug: '\x1b[90m', // bright black
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[41;39m', // red; white
  message: '\x1b[1m', // bold
  key: '\x1b[35m', // magenta
  reset: '\x1b[0m', // reset
};

export interface ConsoleLogWriterOptions {
  /** @default globalThis.Console */
  console?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
  /**
   * Whether to disable colors in the console output.
   *
   * @default env.NO_COLOR || false
   */
  noColor?: boolean;
  /**
   * Whether to include the timestamp at the beginning of the log message.
   *
   * @default false
   */
  noTimestamp?: boolean;
}

export class ConsoleLogWriter implements LogWriter {
  #console: NonNullable<ConsoleLogWriterOptions['console']>;
  #noColor: boolean;
  #noTimestamp: boolean;
  constructor(opts: ConsoleLogWriterOptions = {}) {
    const {
      console = globalThis.console,
      // no color if we're running in browser-like (edge) environments
      noColor = typeof process === 'undefined' ||
        // or no color if https://no-color.org/
        truthyEnv('NO_COLOR'),
      noTimestamp = false,
    } = opts;
    this.#console = console;
    this.#noColor = noColor;
    this.#noTimestamp = noTimestamp;
  }
  color<T extends string | null | undefined>(
    style: keyof typeof asciMap,
    text: T,
  ): T {
    if (!text) {
      return text;
    }
    if (this.#noColor) {
      return text;
    }
    return (asciMap[style] + text + asciMap.reset) as T;
  }
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    this.#console[level === 'trace' ? 'debug' : level](
      [
        !this.#noTimestamp && this.color('timestamp', new Date().toISOString()),
        this.color(level, logLevelToString(level)),
        this.color('message', msg),
        attrs && this.stringifyAttrs(attrs),
      ]
        .filter(Boolean)
        .join(' '),
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
      formattedLine = formattedLine.replace(
        /"([^"]+)":/,
        this.color('key', '$1:'),
      );

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

      // color the opening and closing brackets
      formattedLine = formattedLine.replace(
        /(\[|\{|\]|\})$/,
        this.color('key', '$1'),
      );

      log += formattedLine + '\n';
    }

    // remove last new line
    log = log.slice(0, -1);

    return log;
  }
}
