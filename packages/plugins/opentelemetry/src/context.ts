import { trace, type Context } from '@opentelemetry/api';

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
