import { DisposableSymbols } from '@whatwg-node/disposablestack';
import fastSafeStringify from 'fast-safe-stringify';
import format from 'quick-format-unescaped';
import {
  Attributes,
  getEnv,
  isPromise,
  logLevel,
  MaybeLazy,
  parseAttrs,
  shallowMergeAttributes,
  shouldLog,
  truthyEnv,
} from './utils';
import { ConsoleLogWriter, JSONLogWriter, LogWriter } from './writers';

export type { Attributes };
export type { MaybeLazy, AttributeValue } from './utils';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  /**
   * The minimum log level to log.
   *
   * Providing `false` will disable all logging.
   *
   * Provided function will always be invoked to get the current log level.
   *
   * @default env.LOG_LEVEL || env.DEBUG ? 'debug' : 'info'
   */
  level?: MaybeLazy<LogLevel | false>;
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
   * @default env.LOG_JSON ? [new JSONLogWriter()] : [new ConsoleLogWriter()]
   */
  writers?: [LogWriter, ...LogWriter[]];
}

export class Logger implements AsyncDisposable {
  #level: MaybeLazy<LogLevel | false>;
  #prefix: string | undefined;
  #attrs: Attributes | undefined;
  #writers: [LogWriter, ...LogWriter[]];
  #pendingWrites?: Set<Promise<void>>;

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
    this.#writers =
      opts.writers ??
      (truthyEnv('LOG_JSON')
        ? [new JSONLogWriter()]
        : [new ConsoleLogWriter()]);
  }

  /** The prefix that's prepended to each log message. */
  public get prefix() {
    return this.#prefix;
  }

  /**
   * The attributes that are added to each log. If the log itself contains
   * attributes with keys existing in {@link attrs}, the log's attributes will
   * override.
   */
  public get attrs() {
    return this.#attrs;
  }

  /** The current {@link LogLevel} of the logger. You can change the level using the {@link setLevel} method. */
  public get level() {
    return typeof this.#level === 'function' ? this.#level() : this.#level;
  }

  /**
   * Sets the new {@link LogLevel} of the logger. All subsequent logs, and {@link child child loggers} whose
   * level did not change, will respect the new level.
   */
  public setLevel(level: MaybeLazy<LogLevel | false>) {
    this.#level = level;
  }

  public write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    for (const w of this.#writers) {
      const write$ = w.write(level, attrs, msg);
      if (isPromise(write$)) {
        this.#pendingWrites ??= new Set();
        this.#pendingWrites.add(write$);
        write$
          .then(() => {
            // we remove from pending writes only if the write was successful
            this.#pendingWrites!.delete(write$);
          })
          .catch((e) => {
            // otherwise we keep in the pending write to throw on flush
            console.error('Failed to write async log', e);
          });
      }
    }
  }

  public flush() {
    if (this.#pendingWrites?.size) {
      const errs: unknown[] = [];
      return Promise.allSettled(
        Array.from(this.#pendingWrites).map((w) =>
          w.catch((err) => errs.push(err)),
        ),
      ).then(() => {
        this.#pendingWrites!.clear();
        if (errs.length) {
          throw new AggregateError(
            errs,
            `Failed to flush ${errs.length} writes`,
          );
        }
      });
    }
    return;
  }

  async [DisposableSymbols.asyncDispose]() {
    return this.flush();
  }

  //

  public child(prefix: string): Logger;
  public child(attrs: Attributes, prefix?: string): Logger;
  public child(prefixOrAttrs: string | Attributes, prefix?: string): Logger {
    if (typeof prefixOrAttrs === 'string') {
      return new Logger({
        level: () => this.level, // inherits the parent level (yet can be changed on child only when using setLevel)
        prefix: (this.#prefix || '') + prefixOrAttrs,
        attrs: this.#attrs,
        writers: this.#writers,
      });
    }
    return new Logger({
      level: () => this.level, // inherits the parent level (yet can be changed on child only when using setLevel)
      prefix: (this.#prefix || '') + (prefix || '') || undefined,
      attrs: shallowMergeAttributes(this.#attrs, prefixOrAttrs),
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
      msg = `${this.#prefix}${msg || ''}`.trim(); // we trim everything because maybe the "msg" is empty
    }

    attrs = shallowMergeAttributes(parseAttrs(this.#attrs), parseAttrs(attrs));

    msg =
      msg && rest.length
        ? format(msg, rest, { stringify: fastSafeStringify })
        : msg;

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
