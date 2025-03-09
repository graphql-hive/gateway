import type { Logger } from '@graphql-mesh/types';
import { trace, type Context, type ContextManager } from '@opentelemetry/api';
import { fakePromise } from '@whatwg-node/promise-helpers';
import type { PromiseOrValue } from 'graphql-yoga';

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
  logger: Logger,
  useContextManager: boolean,
  contextManager?: false | ContextManager,
): Promise<ContextManager | false | undefined> {
  if (contextManager != undefined) {
    return fakePromise(contextManager);
  }

  return import('@opentelemetry/context-async-hooks')
    .then((module) => new module.AsyncLocalStorageContextManager())
    .catch((err) => {
      if ((err as any).code === 'ERR_MODULE_NOT_FOUND') {
        if (useContextManager) {
          logger.error(
            "AsyncLocalContext is not available: can't initialize context manager. Either disable context manager usage by providing `useContextManager: false` option or a context manager in the `contextManager` option.",
          );
        }
        return undefined;
      } else {
        throw err;
      }
    });
}
