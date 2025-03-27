import { isPromise, jsonStringify } from './utils';

type Context = Record<PropertyKey, unknown>;

type Attributes = Record<string, any>;

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface LogWriter {
  write(
    level: LogLevel,
    msg: string,
    attrs: Attributes | undefined,
  ): void | Promise<void>;
  flush(): void | Promise<void>;
}

export class ConsoleLogWriter implements LogWriter {
  write(level: LogLevel, msg: string, attrs: Attributes): void {
    switch (level) {
      // TODO: other levels
      default:
        console.log(msg, attrs ? jsonStringify(attrs) : undefined);
    }
  }
  flush() {
    // noop
  }
}

export class Logger implements LogWriter {
  /** Hidden symbol used as a key for appending context attributes. */
  static #CTX_ATTRS_SY = Symbol('LOGGER_CONTEXT_ATTRIBUTES');

  /**
   * Gets the attributes from the {@link context ctx} under the hidden logger symbol key.
   */
  static getCtxAttrs(ctx: Context): Attributes | undefined {
    const metadata = ctx[Logger.#CTX_ATTRS_SY];
    // @ts-expect-error should the type be enforced on runtime?
    return metadata;
  }

  /**
   * Mutates the {@link ctx context object} in place adding the {@link attrs attributes} under
   * the hidden logger symbol key.
   */
  static setAttrsInCtx(ctx: Context, attrs: Attributes) {
    ctx[Logger.#CTX_ATTRS_SY] = {
      // @ts-expect-error this should either be the attributes or undefined
      ...ctx[Logger.CTX_ATTRS_SY],
      ...attrs,
    };
  }

  //

  #writers: LogWriter[];
  #pendingWrites = new Set<Promise<void>>();

  // TODO: logs for specific level

  constructor(writer: LogWriter, ...additionalWriters: LogWriter[]) {
    this.#writers = [writer, ...additionalWriters];
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
    let attrs = Logger.getCtxAttrs(ctx);
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
    let msg = '';
    let attrs: Attributes | undefined;
    if (attrsOrMsg instanceof Object) {
      attrs = attrsOrMsg;
      msg = rest.shift() + ''; // as per the overload, the first rest value is the message. TODO: enforce in runtime?
    } else {
      msg = attrsOrMsg;
    }

    // @ts-expect-error TODO: interpolate values into the message
    const interpolationValues = rest;

    this.write(level, msg, attrs);
  }
}
