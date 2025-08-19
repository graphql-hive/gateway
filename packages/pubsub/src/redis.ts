import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import type { MaybePromise } from '@whatwg-node/promise-helpers';
import type { Redis } from 'ioredis';
import { PubSub, PubSubListener, TopicDataMap } from './pubsub';

/**
 * When a Redis connection enters "subscriber mode" (after calling SUBSCRIBE), it can only execute
 * subscriber commands (SUBSCRIBE, UNSUBSCRIBE, etc.). Meaning, it cannot execute other commands like PUBLISH.
 * To avoid this, we use two separate Redis clients: one for publishing and one for subscribing.
 */
export interface RedisPubSubConnections {
  /** The redis instance that publishes events/topics. */
  pub: Redis;
  /** The redis instance that listens and subscribes to events/topics. */
  sub: Redis;
}

export interface RedisPubSubOptions {
  /**
   * Prefix for Redis channels to avoid conflicts
   * @default '@graphql-hive/pubsub:'
   */
  channelPrefix?: string;
}

/** In-memory {@link PubSub} implementation. */
export class RedisPubSub<M extends TopicDataMap = TopicDataMap>
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

  #redis: RedisPubSubConnections;
  #channelPrefix: string;

  #boundHandleMessage: (channel: string, message: string) => void;

  constructor(redis: RedisPubSubConnections, options: RedisPubSubOptions = {}) {
    this.#redis = redis;
    this.#channelPrefix = options.channelPrefix || '@graphql-hive/pubsub:';
    this.#boundHandleMessage = this.#handleMessage.bind(this);
    this.#redis.sub.on('message', this.#boundHandleMessage);
  }

  #topicToChannel(topic: keyof M): string {
    return `${this.#channelPrefix}${String(topic)}`;
  }
  #topicFromChannel(channel: string): string {
    return channel.replace(this.#channelPrefix, '');
  }

  public subscribedTopics() {
    return this.#subscribers.keys();
  }

  public publish<Topic extends keyof M>(topic: Topic, data: M[Topic]) {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot publish data');
    }
    return new Promise<void>((resolve, reject) => {
      this.#redis.pub.publish(
        this.#topicToChannel(topic),
        JSON.stringify(data),
        (e) => {
          if (e) reject(e);
          else resolve();
        },
      );
    });
  }

  #handleMessage(channel: string, message: string) {
    const topic = this.#topicFromChannel(channel);
    const data = JSON.parse(message);
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
        await this.#redis.sub.subscribe(this.#topicToChannel(topic));
        listeners.set(push, stop);
        await stop;
        listeners.delete(push);
        if (listeners.size === 0) {
          this.#subscribers.delete(topic);
        }
        await this.#redis.sub.unsubscribe(this.#topicToChannel(topic));
      });
    }

    const listenerRef = new WeakRef(listener);
    const unsubscribe = async () => {
      const l = listenerRef.deref(); // dont hold on to the listener
      if (l) listeners!.delete(l);
      if (listeners!.size === 0) {
        this.#subscribers.delete(topic);
      }
      await this.#redis.sub.unsubscribe(this.#topicToChannel(topic));
    };
    listeners.set(listener, unsubscribe);

    return new Promise((resolve, reject) => {
      this.#redis.sub.subscribe(this.#topicToChannel(topic), (err) => {
        if (err) {
          unsubscribe();
          reject(err);
        } else {
          resolve(unsubscribe);
        }
      });
    });
  }

  public async dispose() {
    this.#disposed = true;
    this.#redis.sub.off('message', this.#boundHandleMessage);
    for (const stop of this.#subscribers.values().flatMap((s) => s.values())) {
      stop();
    }
    this.#subscribers.values().forEach((s) => s.clear()); // just in case
    this.#subscribers.clear();
  }

  [DisposableSymbols.asyncDispose]() {
    return this.dispose();
  }
}
