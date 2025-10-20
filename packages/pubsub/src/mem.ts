import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { fakePromise, type MaybePromise } from '@whatwg-node/promise-helpers';
import { PubSub, PubSubListener, TopicDataMap } from './pubsub';

/** In-memory {@link PubSub} implementation. */
export class MemPubSub<M extends TopicDataMap = TopicDataMap>
  implements PubSub<M>
{
  #disposed = false;
  #subscribers = new Map<
    keyof M, // topic
    Map<
      PubSubListener<M, any>, // listener
      () => void // unsubscribe function
    >
  >();

  public subscribedTopics() {
    return this.#subscribers.keys();
  }

  public publish<Topic extends keyof M>(topic: Topic, data: M[Topic]) {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot publish data');
    }
    const listeners = this.#subscribers.get(topic);
    if (listeners) {
      for (const l of listeners.keys()) {
        l(data);
      }
    }
  }

  public subscribe<Topic extends keyof M>(
    topic: Topic,
  ): AsyncIterable<M[Topic]>;
  public subscribe<Topic extends keyof M>(
    topic: Topic,
    listener: PubSubListener<M, Topic>,
  ): MaybePromise<() => MaybePromise<void>>;
  public subscribe<Topic extends keyof M>(
    topic: Topic,
    listener?: PubSubListener<M, Topic>,
  ): AsyncIterable<M[Topic]> | MaybePromise<() => MaybePromise<void>> {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot subscribe to topics');
    }
    let listeners = this.#subscribers.get(topic);
    if (!listeners) {
      listeners = new Map<PubSubListener<M, any>, () => void>();
      this.#subscribers.set(topic, listeners);
    }

    if (!listener) {
      return new Repeater<M[Topic], any, any>(async (push, stop) => {
        listeners.set(push, stop);
        await stop;
        listeners.delete(push);
        if (listeners.size === 0) {
          this.#subscribers.delete(topic);
        }
      });
    }

    const listenerRef = new WeakRef(listener);
    const unsubscribe = () => {
      const l = listenerRef.deref(); // dont hold on to the listener
      if (l) listeners!.delete(l);
      if (listeners!.size === 0) {
        this.#subscribers.delete(topic);
      }
    };
    listeners.set(listener, unsubscribe);

    return unsubscribe;
  }

  public dispose() {
    this.#disposed = true;
    for (const sub of this.#subscribers.values()) {
      for (const stop of sub.values()) {
        stop();
      }
      sub.clear(); // just in case
    }
    this.#subscribers.clear();
  }

  [DisposableSymbols.asyncDispose]() {
    return fakePromise(this.dispose());
  }
}
