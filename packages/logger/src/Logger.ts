import { Attributes, isPromise } from './utils';
import { ConsoleLogWriter, LogWriter } from './writers';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const logLevel: { [level in LogLevel]: number } = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

// TODO: explain what happens when attribute keys match existing keys from the logger (like "msg")

// TODO: an "id" or "name" of a logger allowing us to create scoped loggers which on their own can be disabled/enabled

export interface LoggerOptions {
  /**
   * The minimum log level to log.
   *
   * @default trace
   */
  level?: LogLevel;
  /** A prefix to include in every log's message. */
  prefix?: string;
  /**
   * The attributes to include in all logs. Is mainly used to pass the parent
   * attributes when creating {@link Logger.child child loggers}.
   */
  attrs?: Attributes;
  /**
   * The log writers to use when writing logs.
   *
   * @default [new ConsoleLogWriter()]
   */
  writers: [LogWriter, ...LogWriter[]];
}

export class Logger implements LogWriter {
  #level: LogLevel;
  #prefix: string | undefined;
  #attrs: Attributes | undefined;
  #writers: [LogWriter, ...LogWriter[]];
  #pendingWrites = new Set<Promise<void>>();

  // TODO: logs for specific level

  constructor(opts: LoggerOptions = { writers: [new ConsoleLogWriter()] }) {
    this.#level = opts.level || 'trace';
    this.#prefix = opts.prefix;
    this.#attrs = opts.attrs;
    this.#writers = opts.writers;
  }

  public write(
    level: LogLevel,
    msg: string,
    attrs: Attributes | undefined,
  ): void {
    const pendingWrites = this.#writers
      .map((writer) => writer.write(level, msg, attrs))
      .filter(isPromise);

    for (const pendingWrite of pendingWrites) {
      this.#pendingWrites.add(pendingWrite);
      pendingWrite.catch(() => {
        // TODO: what to do if the async write failed?
      });
      pendingWrite.finally(() => this.#pendingWrites.delete(pendingWrite));
    }
  }

  public flush() {
    if (this.#pendingWrites.size) {
      return Promise.all(this.#pendingWrites).then(() => {
        // void
      });
    }
    return;
  }

  // TODO: flush on dispose

  //

  public child(prefix: string): Logger;
  public child(attrs: Attributes, prefix?: string): Logger;
  public child(prefixOrAttrs: string | Attributes, prefix?: string): Logger {
    if (typeof prefixOrAttrs === 'string') {
      return new Logger({
        prefix: prefixOrAttrs,
        writers: this.#writers,
      });
    }
    return new Logger({
      prefix,
      attrs: prefixOrAttrs,
      writers: this.#writers,
    });
  }

  //

  public log(
    level: LogLevel,
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public log(
    level: LogLevel,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public log(
    level: LogLevel,
    attrsOrMsg: Attributes | string,
    ...rest: unknown[]
  ): void {
    // TODO: validate types on runtime, or not?

    if (logLevel[level] < logLevel[this.#level]) {
      return;
    }

    let msg = '';
    let attrs: Attributes | undefined;
    if (attrsOrMsg instanceof Object) {
      attrs = attrsOrMsg;
      msg = rest.shift() + ''; // as per the overload, the first rest value is the message. TODO: enforce in runtime?
    } else {
      msg = attrsOrMsg;
    }

    if (this.#prefix) {
      msg = `${this.#prefix.trim()} ${msg}`.trim(); // we trim everything because maybe the "msg" is empty
    }

    // TODO: unwrap lazy attribute values

    // @ts-expect-error TODO: interpolate values into the message
    const interpolationValues = rest;

    this.write(level, msg, this.#attrs ? { ...this.#attrs, ...attrs } : attrs);
  }

  public trace(
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public trace(msg: string, ...interpolationValues: unknown[]): void;
  public trace(...args: [arg0: any, ...rest: any[]]): void {
    this.log('trace', ...args);
  }

  public debug(
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public debug(msg: string, ...interpolationValues: unknown[]): void;
  public debug(...args: [arg0: any, ...rest: any[]]): void {
    this.log('debug', ...args);
  }

  public info(
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public info(msg: string, ...interpolationValues: unknown[]): void;
  public info(...args: [arg0: any, ...rest: any[]]): void {
    this.log('info', ...args);
  }

  public warn(
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public warn(msg: string, ...interpolationValues: unknown[]): void;
  public warn(...args: [arg0: any, ...rest: any[]]): void {
    this.log('warn', ...args);
  }

  public error(
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public error(msg: string, ...interpolationValues: unknown[]): void;
  public error(...args: [arg0: any, ...rest: any[]]): void {
    this.log('error', ...args);
  }
}
