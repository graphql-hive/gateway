import type { NatsConnection } from '@nats-io/nats-core';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import {
  mapAsyncIterator,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import { PubSub, PubSubListener, TopicDataMap } from './pubsub';

export interface NATSPubSubOptions {
  /**
   * Prefix for NATS publish subhects to avoid conflicts.
   * Intentionally no default because we don't want to accidentally share channels between different services.
   */
  subjectPrefix: string;
  /**
   * By default, when the pub/sub instance is disposed, it will call
   * `close` on the NATS connection. Set this to `true` if you
   * want to keep the connection alive after disposal.
   *
   * This might be useful if you want to manage the NATS connection's lifecycle
   * outside of the pub/sub instance.
   *
   * @default false
   */
  noCloseOnDispose?: boolean;
}

/** {@link PubSub Hive PubSub} implementation of the [NATS message broker](https://nats.io/). */
export class NATSPubSub<M extends TopicDataMap = TopicDataMap>
  implements PubSub<M>
{
  #disposed = false;
  #closeOnDispose: boolean;
  #activeSubscribers = new Map<() => Promise<void>, keyof M>();
  #nats: NatsConnection;
  #subjectPrefix: string;

  constructor(nats: NatsConnection, options: NATSPubSubOptions) {
    this.#nats = nats;
    this.#subjectPrefix = options.subjectPrefix;
    this.#closeOnDispose = !options.noCloseOnDispose;
    if (String(this.#subjectPrefix || '').trim() === '') {
      throw new Error('NATSPubSub requires a non-empty subjectPrefix');
    }
  }

  #topicToSubject(topic: keyof M): string {
    return `${this.#subjectPrefix}:${String(topic)}`;
  }

  public async subscribedTopics() {
    const distinctTopics: (keyof M)[] = [];
    const activeTopics = Array.from(this.#activeSubscribers.values());
    for (const activeTopic of activeTopics) {
      if (!distinctTopics.includes(activeTopic)) {
        distinctTopics.push(activeTopic);
      }
    }
    // TODO: topics from everywhere under the prefix
    return distinctTopics;
  }

  public publish<Topic extends keyof M>(topic: Topic, data: M[Topic]) {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot publish data');
    }
    // TODO: nats supports a reply mechanism, we can use it to confirm delivery
    this.#nats.publish(this.#topicToSubject(topic), JSON.stringify(data));
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

    if (!listener) {
      const sub = this.#nats.subscribe(this.#topicToSubject(topic));
      const drain = sub.drain.bind(sub);
      const drainRef = new WeakRef(drain);
      this.#activeSubscribers.set(drain, topic);
      const dispose = (err?: unknown) => {
        const drain = drainRef.deref();
        if (drain) this.#activeSubscribers.delete(drain);
        return err;
      };
      return mapAsyncIterator(
        sub,
        (msg) => msg.json(),
        dispose,
        // @ts-expect-error void or undefined is ok
        dispose,
      );
    }

    const listenerRef = { ref: listener as typeof listener | null };
    const sub = this.#nats.subscribe(this.#topicToSubject(topic), {
      callback: (_err, msg) => {
        // TODO: what to do with the error exactly?
        listenerRef.ref?.(msg.json());
      },
    });
    const drain = sub.drain.bind(sub);
    const drainRef = new WeakRef(drain);
    const unsubscribe = async () => {
      listenerRef.ref = null;
      const drain = drainRef.deref();
      if (drain) {
        this.#activeSubscribers.delete(drain);
        await drain();
      }
    };
    this.#activeSubscribers.set(drain, topic);

    return unsubscribe;
  }

  public async dispose() {
    this.#disposed = true;
    await this.#nats.flush();
    await Promise.all(
      Array.from(this.#activeSubscribers.keys()).map((s) => s()),
    );
    this.#activeSubscribers.clear();
    if (this.#closeOnDispose) {
      await this.#nats.close();
    }
  }

  [DisposableSymbols.asyncDispose]() {
    return this.dispose();
  }
}
