import format from 'quick-format-unescaped';
import {
  Attributes,
  getEnv,
  isPromise,
  logLevel,
  MaybeLazy,
  parseAttrs,
  shouldLog,
  truthyEnv,
} from './utils';
import { ConsoleLogWriter, LogWriter } from './writers';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

// TODO: explain what happens when attribute keys match existing keys from the logger (like "msg")

// TODO: an "id" or "name" of a logger allowing us to create scoped loggers which on their own can be disabled/enabled

export interface LoggerOptions {
  /**
   * The minimum log level to log.
   *
   * Providing `false` will disable all logging.
   *
   * @default env.LOG_LEVEL || env.DEBUG ? 'debug' : 'info'
   */
  level?: LogLevel | false;
  /** A prefix to include in every log's message. */
  prefix?: string;
  /**
   * The attributes to include in all logs. Is mainly used to pass the parent
   * attributes when creating {@link Logger.child child loggers}.
   */
  attrs?: MaybeLazy<Attributes>;
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
  #attrs: MaybeLazy<Attributes> | undefined;
  #writers: [LogWriter, ...LogWriter[]];
  #pendingWrites = new Set<Promise<void>>();

  constructor(opts: LoggerOptions = {}) {
    let logLevelEnv = getEnv('LOG_LEVEL');
    if (logLevelEnv && !(logLevelEnv in logLevel)) {
      throw new Error(
        `Invalid LOG_LEVEL environment variable "${logLevelEnv}". Must be one of: ${[...Object.keys(logLevel), 'false'].join(',  ')}`,
      );
    }
    this.#level =
      opts.level ??
      (logLevelEnv as LogLevel) ??
      (truthyEnv('DEBUG') ? 'debug' : 'info');
    this.#prefix = opts.prefix;
    this.#attrs = opts.attrs;
    this.#writers = opts.writers ?? [new ConsoleLogWriter()];
  }

  public get prefix() {
    return this.#prefix;
  }

  public get level() {
    return this.#level;
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
  public child(attrs: MaybeLazy<Attributes>, prefix?: string): Logger;
  public child(
    prefixOrAttrs: string | MaybeLazy<Attributes>,
    prefix?: string,
  ): Logger {
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
  public log(level: LogLevel, attrs: MaybeLazy<Attributes>): void;
  public log(level: LogLevel, msg: string, ...interpol: unknown[]): void;
  public log(
    level: LogLevel,
    attrs: MaybeLazy<Attributes>,
    msg: string,
    ...interpol: unknown[]
  ): void;
  public log(
    level: LogLevel,
    maybeAttrsOrMsg?: MaybeLazy<Attributes> | string | null | undefined,
    ...rest: unknown[]
  ): void {
    if (!shouldLog(this.#level, level)) {
      return;
    }

    let msg: string | undefined;
    let attrs: MaybeLazy<Attributes> | undefined;
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

    attrs = attrs ? parseAttrs(attrs) : attrs;
    attrs = this.#attrs ? { ...parseAttrs(this.#attrs), ...attrs } : attrs;
    msg = msg ? format(msg, rest) : msg;

    this.write(level, attrs, msg);
    if (truthyEnv('LOG_TRACE_LOGS')) {
      console.trace('👆');
    }
  }

  public trace(): void;
  public trace(attrs: MaybeLazy<Attributes>): void;
  public trace(msg: string, ...interpol: unknown[]): void;
  public trace(
    attrs: MaybeLazy<Attributes>,
    msg: string,
    ...interpol: unknown[]
  ): void;
  public trace(...args: any): void {
    this.log(
      'trace',
      // @ts-expect-error
      ...args,
    );
  }

  public debug(): void;
  public debug(attrs: MaybeLazy<Attributes>): void;
  public debug(msg: string, ...interpol: unknown[]): void;
  public debug(
    attrs: MaybeLazy<Attributes>,
    msg: string,
    ...interpol: unknown[]
  ): void;
  public debug(...args: any): void {
    this.log(
      'debug',
      // @ts-expect-error
      ...args,
    );
  }

  public info(): void;
  public info(attrs: MaybeLazy<Attributes>): void;
  public info(msg: string, ...interpol: unknown[]): void;
  public info(
    attrs: MaybeLazy<Attributes>,
    msg: string,
    ...interpol: unknown[]
  ): void;
  public info(...args: any): void {
    this.log(
      'info',
      // @ts-expect-error
      ...args,
    );
  }

  public warn(): void;
  public warn(attrs: MaybeLazy<Attributes>): void;
  public warn(msg: string, ...interpol: unknown[]): void;
  public warn(
    attrs: MaybeLazy<Attributes>,
    msg: string,
    ...interpol: unknown[]
  ): void;
  public warn(...args: any): void {
    this.log(
      'warn',
      // @ts-expect-error
      ...args,
    );
  }

  public error(): void;
  public error(attrs: MaybeLazy<Attributes>): void;
  public error(msg: string, ...interpol: unknown[]): void;
  public error(
    attrs: MaybeLazy<Attributes>,
    msg: string,
    ...interpol: unknown[]
  ): void;
  public error(...args: any): void {
    this.log(
      'error',
      // @ts-expect-error
      ...args,
    );
  }
}
