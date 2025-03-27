import { Attributes, Context, isPromise } from './utils';
import { ConsoleLogWriter, LogWriter } from './writers';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  /**
   * The log writers to use when writing logs.
   *
   * @default [new ConsoleLogWriter()]
   */
  writers: [LogWriter, ...LogWriter[]];
}

export class Logger implements LogWriter {
  /**
   * Hidden symbol used as a key for appending context attributes for all loggers.
   *
   * TODO: should the symbol be scoped for a specific logger?
   */
  static #CTX_ATTRS_SY = Symbol('hive.logger.context.attributes');

  /**
   * Gets the attributes from the {@link context ctx} under the hidden logger symbol key.
   */
  public getCtxAttrs(ctx: Context): Attributes | undefined {
    return Object(ctx)[Logger.#CTX_ATTRS_SY];
  }

  /**
   * Mutates the {@link ctx context object} in place adding the {@link attrs attributes} under
   * the hidden logger symbol key.
   */
  public setAttrsInCtx(ctx: Context, attrs: Attributes) {
    Object(ctx)[Logger.#CTX_ATTRS_SY] = {
      ...this.getCtxAttrs(ctx),
      ...attrs,
    };
  }

  //

  #writers: LogWriter[];
  #pendingWrites = new Set<Promise<void>>();

  // TODO: logs for specific level

  constructor(opts: LoggerOptions = { writers: [new ConsoleLogWriter()] }) {
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

  public logCtx(
    level: LogLevel,
    ctx: Context,
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public logCtx(
    level: LogLevel,
    ctx: Context,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public logCtx(
    level: LogLevel,
    ctx: Context,
    attrsOrMsg: Attributes | string,
    ...rest: unknown[]
  ): void {
    let msg = '';
    let attrs = this.getCtxAttrs(ctx);
    if (attrsOrMsg instanceof Object) {
      attrs = { ...attrs, ...attrsOrMsg };
      msg = rest.shift() + ''; // as per the overload, the first rest value is the message. TODO: enforce in runtime?
    } else {
      msg = attrsOrMsg;
    }
    if (attrs) {
      this.log(level, attrs, msg, ...rest);
    } else {
      this.log(level, msg, ...rest);
    }
  }

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

    // TODO: log only if level is enabled

    let msg = '';
    let attrs: Attributes | undefined;
    if (attrsOrMsg instanceof Object) {
      attrs = attrsOrMsg;
      msg = rest.shift() + ''; // as per the overload, the first rest value is the message. TODO: enforce in runtime?
    } else {
      msg = attrsOrMsg;
    }

    // TODO: unwrap lazy attribute values

    // @ts-expect-error TODO: interpolate values into the message
    const interpolationValues = rest;

    this.write(level, msg, attrs);
  }

  public traceCtx(
    ctx: Context,
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public traceCtx(
    ctx: Context,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public traceCtx(...args: [ctx: Context, arg0: any, ...rest: any[]]): void {
    this.logCtx('trace', ...args);
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

  public debugCtx(
    ctx: Context,
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public debugCtx(
    ctx: Context,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public debugCtx(...args: [ctx: Context, arg0: any, ...rest: any[]]): void {
    this.logCtx('debug', ...args);
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

  public infoCtx(
    ctx: Context,
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public infoCtx(
    ctx: Context,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public infoCtx(...args: [ctx: Context, arg0: any, ...rest: any[]]): void {
    this.logCtx('info', ...args);
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

  public warnCtx(
    ctx: Context,
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public warnCtx(
    ctx: Context,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public warnCtx(...args: [ctx: Context, arg0: any, ...rest: any[]]): void {
    this.logCtx('warn', ...args);
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

  public errorCtx(
    ctx: Context,
    attrs: Attributes,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public errorCtx(
    ctx: Context,
    msg: string,
    ...interpolationValues: unknown[]
  ): void;
  public errorCtx(...args: [ctx: Context, arg0: any, ...rest: any[]]): void {
    this.logCtx('error', ...args);
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
