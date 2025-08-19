import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import type Redis from 'ioredis';
import type { HivePubSub, PubSubListener, TopicDataMap } from './pubsub';

// TODO: use hive logger for logging once ready

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
  /**
   * Maximum number of retries for Redis operations
   * @default 3
   */
  maxRetries?: number;
  /**
   * Retry delay in milliseconds
   * @default 1000
   */
  retryDelay?: number;
}

export class RedisPubSub<Data extends TopicDataMap = TopicDataMap>
  implements HivePubSub<Data>
{
  readonly #channelPrefix: string;
  readonly #maxRetries: number;
  readonly #retryDelay: number;

  // Track local subscriptions
  readonly #topicListeners = new Map<
    keyof Data,
    Set<PubSubListener<Data, any>>
  >();
  readonly #subIdTopic = new Map<number, keyof Data>();
  readonly #subIdListeners = new Map<number, PubSubListener<Data, any>>();
  readonly #asyncIteratorStops = new Set<() => void>();

  // Track Redis subscriptions
  readonly #redisSubscriptions = new Set<string>();
  #isDisposed = false;

  constructor(
    private redis: RedisPubSubConnections,
    options: RedisPubSubOptions = {},
  ) {
    const {
      channelPrefix = '@graphql-hive/pubsub:',
      maxRetries = 3,
      retryDelay = 1000,
    } = options;

    this.#channelPrefix = channelPrefix;
    this.#maxRetries = maxRetries;
    this.#retryDelay = retryDelay;

    // Handle incoming Redis messages
    this.redis.sub.on('message', this.#handleRedisMessage.bind(this));
  }

  #handleRedisMessage(channel: string, message: string): void {
    if (this.#isDisposed) {
      return;
    }

    try {
      // Extract topic from channel name
      const topic = this.#extractTopicFromChannel(channel);
      if (!topic) {
        return;
      }

      // Parse message data
      let data: any;
      try {
        data = JSON.parse(message);
      } catch {
        data = message; // Fallback to raw string if not JSON
      }

      // Notify local listeners
      const listeners = this.#topicListeners.get(topic);
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(data);
          } catch (error) {
            console.error('Error in PubSub listener:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error handling Redis message:', error);
    }
  }

  #getChannelName(topic: keyof Data): string {
    return `${this.#channelPrefix}${String(topic)}`;
  }

  #extractTopicFromChannel(channel: string): keyof Data | null {
    if (!channel.startsWith(this.#channelPrefix)) {
      return null;
    }
    return channel.slice(this.#channelPrefix.length) as keyof Data;
  }

  async #subscribeToRedisChannel(topic: keyof Data): Promise<void> {
    const channel = this.#getChannelName(topic);

    if (this.#redisSubscriptions.has(channel)) {
      return; // Already subscribed
    }

    try {
      await this.redis.sub.subscribe(channel, (err) => {
        if (err) {
          // TODO: throw somehow
          console.error(
            `Failed to subscribe to Redis channel ${channel}:`,
            err,
          );
          throw err;
        }
      });
      this.#redisSubscriptions.add(channel);
    } catch (error) {
      console.error(`Failed to subscribe to Redis channel ${channel}:`, error);
      throw error;
    }
  }

  async #unsubscribeFromRedisChannel(topic: keyof Data): Promise<void> {
    const channel = this.#getChannelName(topic);

    if (!this.#redisSubscriptions.has(channel)) {
      return; // Not subscribed
    }

    // Check if there are still local listeners for this topic
    const listeners = this.#topicListeners.get(topic);
    if (listeners && listeners.size > 0) {
      return; // Still have local listeners
    }

    try {
      await this.redis.sub.unsubscribe(channel, (err) => {
        if (err) {
          // TODO: throw somehow
          console.error(
            `Failed to unsubscribe from Redis channel ${channel}:`,
            err,
          );
        }
      });
      this.#redisSubscriptions.delete(channel);
    } catch (error) {
      console.error(
        `Failed to unsubscribe from Redis channel ${channel}:`,
        error,
      );
    }
  }

  async #retryPublish(
    channel: string,
    message: string,
    attempt: number,
  ): Promise<void> {
    if (attempt >= this.#maxRetries || this.#isDisposed) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, this.#retryDelay));

    try {
      await this.redis.pub.publish(channel, message);
    } catch (error) {
      console.error(
        `Retry ${attempt + 1} failed for Redis publish to ${channel}:`,
        error,
      );
      await this.#retryPublish(channel, message, attempt + 1);
    }
  }

  /** @deprecated Please use {@link subscribedTopics} instead. */
  getEventNames(): Iterable<keyof Data> {
    return this.#topicListeners.keys();
  }

  subscribedTopics(): Iterable<keyof Data> {
    return this.#topicListeners.keys();
  }

  publish<Topic extends keyof Data>(topic: Topic, data: Data[Topic]): void {
    if (this.#isDisposed) {
      throw new Error('PubSub instance has been disposed');
    }

    const channel = this.#getChannelName(topic);
    const message = JSON.stringify(data);

    // Publish to Redis (fire and forget with error handling)
    this.redis.pub.publish(channel, message).catch((error) => {
      console.error(`Failed to publish to Redis channel ${channel}:`, error);

      // TODO: Implement retry logic

      this.#retryPublish(channel, message, 0);
    });
  }

  subscribe<Topic extends keyof Data>(
    topic: Topic,
    listener: PubSubListener<Data, Topic>,
  ): number {
    if (this.#isDisposed) {
      throw new Error('PubSub instance has been disposed');
    }

    // Add to local listeners
    let listeners = this.#topicListeners.get(topic);
    if (!listeners) {
      listeners = new Set<PubSubListener<Data, Topic>>();
      this.#topicListeners.set(topic, listeners);

      // Subscribe to Redis channel for this topic
      this.#subscribeToRedisChannel(topic).catch((error) => {
        console.error(
          `Failed to subscribe to Redis for topic ${String(topic)}:`,
          error,
        );
      });
    }
    listeners.add(listener);

    // Generate subscription ID
    const subId = Math.floor(Math.random() * 100_000_000);
    this.#subIdTopic.set(subId, topic);
    this.#subIdListeners.set(subId, listener);

    return subId;
  }

  unsubscribe(subId: number): void {
    const listener = this.#subIdListeners.get(subId);
    if (!listener) {
      return; // Already unsubscribed
    }
    this.#subIdListeners.delete(subId);

    const topic = this.#subIdTopic.get(subId);
    if (!topic) {
      return; // Should not happen
    }
    this.#subIdTopic.delete(subId);

    const listeners = this.#topicListeners.get(topic);
    if (!listeners) {
      return; // Should not happen
    }

    listeners.delete(listener);
    if (listeners.size === 0) {
      this.#topicListeners.delete(topic);

      // Unsubscribe from Redis channel if no more local listeners
      this.#unsubscribeFromRedisChannel(topic).catch((error) => {
        console.error(
          `Failed to unsubscribe from Redis for topic ${String(topic)}:`,
          error,
        );
      });
    }
  }

  asyncIterator<Topic extends keyof Data>(
    topic: Topic,
  ): AsyncIterable<Data[Topic]> {
    if (this.#isDisposed) {
      throw new Error('PubSub instance has been disposed');
    }

    return new Repeater(async (push, stop) => {
      const subId = this.subscribe(topic, push);
      this.#asyncIteratorStops.add(stop);

      await stop;

      this.#asyncIteratorStops.delete(stop);
      this.unsubscribe(subId);
    });
  }

  dispose(): void {
    if (this.#isDisposed) {
      return;
    }

    this.#isDisposed = true;

    // Clear local state
    this.#topicListeners.clear();
    this.#subIdListeners.clear();
    this.#subIdTopic.clear();

    // Stop all async iterators
    for (const stop of this.#asyncIteratorStops) {
      try {
        stop();
      } catch (error) {
        console.error('Error stopping async iterator:', error);
      }
    }
    this.#asyncIteratorStops.clear();

    // Disconnect Redis clients
    this.redis.pub.disconnect();
    this.redis.sub.disconnect();
    this.#redisSubscriptions.clear();
  }

  [DisposableSymbols.dispose](): void {
    this.dispose();
  }

  /**
   * Check if the PubSub instance is healthy and connected to Redis
   */
  async isHealthy(): Promise<boolean> {
    try {
      const publisherStatus = this.redis.pub.status;
      const subscriberStatus = this.redis.sub.status;

      return publisherStatus === 'ready' && subscriberStatus === 'ready';
    } catch {
      return false;
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      localSubscriptions: this.#topicListeners.size,
      redisSubscriptions: this.#redisSubscriptions.size,
      activeAsyncIterators: this.#asyncIteratorStops.size,
      publisherStatus: this.redis.pub.status,
      subscriberStatus: this.redis.sub.status,
      isDisposed: this.#isDisposed,
    };
  }
}
