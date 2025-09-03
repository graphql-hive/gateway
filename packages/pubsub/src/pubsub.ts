import type { DisposableSymbols } from '@whatwg-node/disposablestack';
import type { MaybePromise } from '@whatwg-node/promise-helpers';

export type TopicDataMap = { [topic: string]: any /* data */ };

export type PubSubListener<
  Data extends TopicDataMap,
  Topic extends keyof Data,
> = (data: Data[Topic]) => void;

// DO NOT FORGET TO UPDATE DOCUMENTATION WHEN CHANGING THE INTERFACE

export interface PubSub<M extends TopicDataMap = TopicDataMap> {
  /**
   * Publish {@link data} for a {@link topic}.
   * @returns `void` or a `Promise` that resolves when the data has been successfully published
   */
  publish<Topic extends keyof M>(
    topic: Topic,
    data: M[Topic],
  ): MaybePromise<void>;
  /**
   * A distinct list of all topics that are currently subscribed to.
   * Can be a promise to accomodate distributed systems where subscribers exist on other
   * locations and we need to know about all of them.
   */
  subscribedTopics(): MaybePromise<Iterable<keyof M>>;
  /**
   * Subscribe and listen to a {@link topic} receiving its data.
   *
   * If the {@link listener} is provided, it will be called whenever data is emitted for the {@link topic},
   *
   * @returns an unsubscribe function or a `Promise<unsubscribe function>` that resolves when the subscription is successfully established. the unsubscribe function returns `void` or a `Promise` that resolves on successful unsubscribe and subscription cleanup
   *
   * If the {@link listener} is not provided,
   *
   * @returns an `AsyncIterable` that yields data for the given {@link topic}
   */
  subscribe<Topic extends keyof M>(topic: Topic): AsyncIterable<M[Topic]>;
  subscribe<Topic extends keyof M>(
    topic: Topic,
    listener: PubSubListener<M, Topic>,
  ): MaybePromise<() => MaybePromise<void>>;
  /**
   * Closes active subscriptions and disposes of all resources. Publishing and subscribing after disposal
   * is not possible and will throw an error if attempted.
   */
  dispose(): MaybePromise<void>;
  /** @see {@link dispose} */
  [DisposableSymbols.asyncDispose](): Promise<void>;
}
