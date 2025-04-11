import { trace, type Context, type ContextManager } from '@opentelemetry/api';
import { fakePromise } from '@whatwg-node/promise-helpers';

type Node = {
  ctx: Context;
  previous?: Node;
};

export class OtelContextStack {
  #root: Node;
  #current: Node;

  constructor(root: Context) {
    this.#root = { ctx: root };
    this.#current = this.#root;
  }

  get current(): Context {
    return this.#current.ctx;
  }

  get root(): Context {
    return this.#root.ctx;
  }

  push = (ctx: Context) => {
    this.#current = { ctx, previous: this.#current };
  };

  pop = () => {
    this.#current = this.#current.previous ?? this.#root;
  };

  toString() {
    let node: Node | undefined = this.#current;
    const names = [];
    while (node != undefined) {
      names.push((trace.getSpan(node.ctx) as unknown as { name: string }).name);
      node = node.previous;
    }
    return names.join(' -> ');
  }
}

export function getContextManager(
  contextManager?: boolean | ContextManager,
): Promise<ContextManager | undefined> {
  if (contextManager === false) {
    return fakePromise(undefined);
  }

  if (contextManager === true || contextManager == undefined) {
    const doNotBundleThisModule = '@opentelemetry';
    return import(`${doNotBundleThisModule}/context-async-hooks`)
      .then((module) => new module.AsyncLocalStorageContextManager())
      .catch((err) => {
        console.dir('module error', err);
        // If `async_hooks` is not available, we want to error only if the context manager is
        // explicitly enabled.
        if (contextManager === true) {
          throw new Error(
            "[OTEL] 'node:async_hooks' module is not available: can't initialize context manager. Possible solutions:\n" +
              '\t- disable context manager usage by providing `contextManager: false`\n' +
              '\t- provide a custom context manager in the `contextManager` option' +
              'Learn more about OTEL configuration here: https://the-guild.dev/graphql/hive/docs/gateway/monitoring-tracing#opentelemetry-traces',
            { cause: err },
          );
        }
      });
  }

  return fakePromise(contextManager);
}
