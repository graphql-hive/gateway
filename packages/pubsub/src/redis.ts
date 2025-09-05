import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import type { MaybePromise } from '@whatwg-node/promise-helpers';
import type { Redis, RedisKey } from 'ioredis';
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
   * Prefix for Redis channels to avoid conflicts.
   * Intentionally no default because we don't want to accidentally share channels between different services.
   */
  channelPrefix: string;
  /**
   * By default, when the pub/sub instance is disposed, it will call
   * `quit` on both Redis clients. Set this to `true` if you
   * want to keep the clients alive after disposal.
   *
   * This might be useful if you want to manage the Redis clients' lifecycle
   * outside of the pub/sub instance.
   *
   * @default false
   */
  noQuitOnDispose?: boolean;
}

/** {@link PubSub Hive PubSub} implementation of [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/). */
export class RedisPubSub<M extends TopicDataMap = TopicDataMap>
  implements PubSub<M>
{
  #disposed = false;
  #quitOnDispose: boolean;
  #subscribers = new Map<
    keyof M, // topic
    Map<
      PubSubListener<M, any>, // listener
      () => void // unsubscribe function
    >
  >();
  #subscribersSetKey: RedisKey;

  #redis: RedisPubSubConnections;
  #channelPrefix: string;

  #boundHandleMessage: (channel: string, message: string) => void;

  constructor(redis: RedisPubSubConnections, options: RedisPubSubOptions) {
    this.#redis = redis;
    this.#channelPrefix = options.channelPrefix;
    if (String(this.#channelPrefix || '').trim() === '') {
      throw new Error('RedisPubSub requires a non-empty channelPrefix');
    }
    this.#subscribersSetKey = `subscribers:${this.#channelPrefix}`;
    this.#quitOnDispose = !options.noQuitOnDispose;
    this.#boundHandleMessage = this.#handleMessage.bind(this);
    this.#redis.sub.on('message', this.#boundHandleMessage);
  }

  #topicToChannel(topic: keyof M): string {
    return `${this.#channelPrefix}:${String(topic)}`;
  }
  #topicFromChannel(channel: string): string {
    return channel.replace(`${this.#channelPrefix}:`, '');
  }

  public async subscribedTopics() {
    const distinctTopics = Array.from(this.#subscribers.keys());
    for (const otherTopic of await this.#redis.pub.smembers(
      this.#subscribersSetKey,
    )) {
      if (!distinctTopics.includes(otherTopic)) {
        distinctTopics.push(otherTopic);
      }
    }
    return distinctTopics;
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

    // redis args for the set to inform about subscribers count, this is used by the main gateway to know whether there are subscribers
    const setArgs: [RedisKey, string] = [
      this.#subscribersSetKey,
      String(topic),
    ];

    if (!listener) {
      return new Repeater<M[Topic], any, any>(async (push, stop) => {
        await this.#redis.sub.subscribe(this.#topicToChannel(topic));
        await this.#redis.pub.sadd(...setArgs);
        listeners.set(push, stop);
        await stop;
        listeners.delete(push);
        if (listeners.size === 0) {
          this.#subscribers.delete(topic);
        }
        await this.#redis.pub.srem(...setArgs);
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
      await this.#redis.pub.srem(...setArgs);
      await this.#redis.sub.unsubscribe(this.#topicToChannel(topic));
    };
    listeners.set(listener, unsubscribe);

    return (async () => {
      await this.#redis.sub.subscribe(this.#topicToChannel(topic));
      await this.#redis.pub.sadd(...setArgs);
      return unsubscribe;
    })();
  }

  public async dispose() {
    this.#disposed = true;
    this.#redis.sub.off('message', this.#boundHandleMessage);
    for (const sub of this.#subscribers.values()) {
      for (const stop of sub.values()) {
        stop();
      }
      sub.clear(); // just in case
    }
    this.#subscribers.clear();
    if (this.#quitOnDispose) {
      await Promise.all([this.#redis.pub.quit(), this.#redis.sub.quit()]);
    }
  }

  [DisposableSymbols.asyncDispose]() {
    return this.dispose();
  }
}
