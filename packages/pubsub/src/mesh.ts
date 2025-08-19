import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { isPromise } from '@whatwg-node/promise-helpers';
import { MaybePromise } from 'bun';
import { PubSub } from './pubsub';

/** Copied from @graphql-mesh/types#AllHooks */
export type AllHooks = {
  destroy: void;
  [key: string]: any;
};

/** Copied from @graphql-mesh/types#HookName */
export type HookName = keyof AllHooks & string;

/**
 * Converts the {@link PubSub Hive PubSub interface} to the legacy `MeshPubSub`
 * from `@graphql-mesh/types`. Please avoid using this class directly because
 * it will be completely removed in the future, instead migrate your project to
 * use the {@link PubSub new interface}.
 *
 * @deprecated This class is deprecated and will be removed in the future. Implement and use the new {@link PubSub Hive PubSub interface} instead.
 */
export class MeshPubSub {
  #pubsub: PubSub;
  #subs = new Map<
    number /** subId */,
    {
      triggerName: HookName;
      unsubscribe: MaybePromise<() => MaybePromise<void>>;
    }
  >();

  constructor(pubsub: PubSub) {
    this.#pubsub = pubsub;
  }

  static from(pubsub: undefined): undefined;
  static from(pubsub: PubSub): MeshPubSub;
  static from(pubsub: undefined | PubSub): undefined | MeshPubSub;
  static from(pubsub: undefined | PubSub): undefined | MeshPubSub {
    if (!pubsub) return undefined;
    return new MeshPubSub(pubsub);
  }

  publish<THook extends HookName>(
    triggerName: THook,
    payload: AllHooks[THook],
  ): void {
    this.#pubsub.publish(triggerName, payload);
  }

  subscribe<THook extends HookName>(
    triggerName: THook,
    onMessage: (data: AllHooks[THook]) => void,
  ): number {
    const subId = Math.floor(Math.random() * 100_000_000);
    const unsub = this.#pubsub.subscribe(triggerName, onMessage);
    this.#subs.set(subId, { triggerName, unsubscribe: unsub });
    if (isPromise(unsub)) {
      unsub.catch((err) => {
        this.#subs.delete(subId);
        // TODO: what to do? is just logging ok?
        console.error(`Failed to subscribe to ${triggerName}`, err);
      });
    }
    return subId;
  }

  unsubscribe(subId: number): void {
    const { unsubscribe } = this.#subs.get(subId) || {};
    if (!unsubscribe) {
      return;
    }
    this.#subs.delete(subId);
    if ('then' in unsubscribe) {
      unsubscribe.then((unsub) => {
        const unsubbed$ = unsub();
        if (isPromise(unsubbed$)) {
          unsubbed$.catch((err) => {
            console.error(`Failed to unsubscribe from ${subId}`, err);
          });
        }
      });
    } else {
      unsubscribe();
    }
  }

  getEventNames(): Iterable<string> {
    return new Set(
      // get only distinct trigger names
      this.#subs.values().map(({ triggerName }) => triggerName),
    );
  }

  asyncIterator<THook extends HookName>(
    triggerName: THook,
  ): AsyncIterable<AllHooks[THook]> {
    return new Repeater(async (push, stop) => {
      const subId = this.subscribe(triggerName, push);
      await stop;
      this.unsubscribe(subId);
    });
  }

  public dispose() {
    return this.#pubsub.dispose();
  }

  [DisposableSymbols.asyncDispose]() {
    return this.#pubsub.dispose();
  }
}
