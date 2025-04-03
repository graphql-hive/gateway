import { Attributes, isPromise, unwrapAttrs } from './utils';
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
   * Providing `false` will disable all logging.
   *
   * @default trace
   */
  level?: LogLevel | false;
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
  writers?: [LogWriter, ...LogWriter[]];
}

export class Logger implements LogWriter {
  #level: LogLevel | false;
  #prefix: string | undefined;
  #attrs: Attributes | undefined;
  #writers: [LogWriter, ...LogWriter[]];
  #pendingWrites = new Set<Promise<void>>();

  // TODO: logs for specific level

  constructor(opts: LoggerOptions = {}) {
    this.#level = opts.level ?? 'trace';
    this.#prefix = opts.prefix;
    this.#attrs = opts.attrs;
    this.#writers = opts.writers ?? [new ConsoleLogWriter()];
  }

  public get prefix() {
    return this.#prefix;
  }

  public write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    const pendingWrites = this.#writers
      .map((writer) => writer.write(level, attrs, msg))
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

  public log(level: LogLevel): void;
  public log(level: LogLevel, attrs: Attributes): void;
  public log(level: LogLevel, msg: string, ...interpol: unknown[]): void;
  public log(
    level: LogLevel,
    attrs: Attributes,
    msg: string,
    ...interpol: unknown[]
  ): void;
  public log(
    level: LogLevel,
    maybeAttrsOrMsg?: Attributes | string | null | undefined,
    ...rest: unknown[]
  ): void {
    // TODO: validate types on runtime, or not?

    if (this.#level === false || logLevel[level] < logLevel[this.#level]) {
      return;
    }

    let msg: string | null = null;
    let attrs: Attributes | undefined;
    if (typeof maybeAttrsOrMsg === 'string') {
      msg = maybeAttrsOrMsg;
    } else if (maybeAttrsOrMsg) {
      attrs = maybeAttrsOrMsg;
      if (typeof rest[0] === 'string') {
        // we shift because the "rest" becomes "interpol"
        msg = rest.shift() as string;
      }
    }

    if (this.#prefix) {
      msg = `${this.#prefix.trim()} ${msg || ''}`.trim(); // we trim everything because maybe the "msg" is empty
    }

    attrs = this.#attrs ? { ...this.#attrs, ...attrs } : attrs;
    attrs = attrs ? unwrapAttrs(attrs) : attrs;

    // @ts-expect-error TODO: interpolate values into the message
    const interpol = rest;

    this.write(level, attrs, msg);
  }

  public trace(): void;
  public trace(attrs: Attributes): void;
  public trace(msg: string, ...interpol: unknown[]): void;
  public trace(attrs: Attributes, msg: string, ...interpol: unknown[]): void;
  public trace(...args: any): void {
    this.log(
      'trace',
      // @ts-expect-error
      ...args,
    );
  }

  public debug(): void;
  public debug(attrs: Attributes): void;
  public debug(msg: string, ...interpol: unknown[]): void;
  public debug(attrs: Attributes, msg: string, ...interpol: unknown[]): void;
  public debug(...args: any): void {
    this.log(
      'debug',
      // @ts-expect-error
      ...args,
    );
  }

  public info(): void;
  public info(attrs: Attributes): void;
  public info(msg: string, ...interpol: unknown[]): void;
  public info(attrs: Attributes, msg: string, ...interpol: unknown[]): void;
  public info(...args: any): void {
    this.log(
      'info',
      // @ts-expect-error
      ...args,
    );
  }

  public warn(): void;
  public warn(attrs: Attributes): void;
  public warn(msg: string, ...interpol: unknown[]): void;
  public warn(attrs: Attributes, msg: string, ...interpol: unknown[]): void;
  public warn(...args: any): void {
    this.log(
      'warn',
      // @ts-expect-error
      ...args,
    );
  }

  public error(): void;
  public error(attrs: Attributes): void;
  public error(msg: string, ...interpol: unknown[]): void;
  public error(attrs: Attributes, msg: string, ...interpol: unknown[]): void;
  public error(...args: any): void {
    this.log(
      'error',
      // @ts-expect-error
      ...args,
    );
  }
}
