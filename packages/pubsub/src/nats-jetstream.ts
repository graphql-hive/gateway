import { DeliverPolicy, jetstream } from '@nats-io/jetstream';
import type { JetStreamClient } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/nats-core';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import type { MaybePromise } from '@whatwg-node/promise-helpers';
import { PubSub, PubSubListener, TopicDataMap } from './pubsub';

/**
 * Envelope yielded by {@link NATSJetStreamPubSub} subscriptions, pairing the published
 * {@link TopicDataMap data} with an opaque replay `cursor`.
 */
export type JetStreamTopicDataMap<M extends TopicDataMap> = {
  [Topic in keyof M]: {
    data: M[Topic];
    cursor: string;
  };
};

/** Subscribe options required by {@link NATSJetStreamPubSub} for every topic. */
export type JetStreamSubscribeOptions = {
  /**
   * Opaque cursor returned by a previous subscription's message, replay resumes right after it.
   * Pass `undefined` to only receive messages published after the subscription starts.
   */
  cursor: string | undefined;
};

export interface NATSJetStreamPubSubOptions {
  /**
   * Prefix for NATS publish subjects to avoid conflicts.
   * Intentionally no default because we don't want to accidentally share channels between different services.
   */
  subjectPrefix: string;
  /**
   * Name of the JetStream stream to publish and subscribe through.
   *
   * The stream is not created nor configured by this pub/sub, it must already exist and be
   * configured to capture the subjects used by this pub/sub (i.e. `${subjectPrefix}:${topic}`).
   */
  stream: string;
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

/**
 * {@link PubSub Hive PubSub} implementation using [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream)
 * persisted streams.
 *
 * Unlike {@link PubSub}'s regular AsyncIterable subscribe, subscribing here yields the published
 * data alongside an opaque `cursor`. Passing that cursor back in through the subscribe options on
 * a later subscription resumes delivery right after it, allowing subscribers to recover events
 * missed while disconnected.
 */
export class NATSJetStreamPubSub<
  M extends TopicDataMap = TopicDataMap,
> implements PubSub<JetStreamTopicDataMap<M>, JetStreamSubscribeOptions> {
  #disposed = false;
  #closeOnDispose: boolean;
  #nats: NatsConnection;
  #js: JetStreamClient;
  #subjectPrefix: string;
  #stream: string;
  #activeConsumers = new Map<() => Promise<void>, keyof M>();

  constructor(nats: NatsConnection, options: NATSJetStreamPubSubOptions) {
    this.#nats = nats;
    this.#subjectPrefix = options.subjectPrefix;
    this.#stream = options.stream;
    this.#closeOnDispose = !options.noCloseOnDispose;
    if (String(this.#subjectPrefix || '').trim() === '') {
      throw new Error('NATSJetStreamPubSub requires a non-empty subjectPrefix');
    }
    if (String(this.#stream || '').trim() === '') {
      throw new Error('NATSJetStreamPubSub requires a non-empty stream');
    }
    this.#js = jetstream(nats);
  }

  #topicToSubject(topic: keyof M): string {
    return `${this.#subjectPrefix}:${String(topic)}`;
  }

  /** Cursors are opaque outside of this adapter, they're simply the stream's message sequence. */
  #parseCursor(cursor: string): number {
    const seq = Number(cursor);
    if (!Number.isInteger(seq) || seq <= 0) {
      throw new Error(`Invalid cursor "${cursor}"`);
    }
    return seq;
  }

  public async subscribedTopics() {
    const distinctTopics: (keyof M)[] = [];
    for (const topic of this.#activeConsumers.values()) {
      if (!distinctTopics.includes(topic)) {
        distinctTopics.push(topic);
      }
    }
    return distinctTopics;
  }

  public async publish<Topic extends keyof M>(topic: Topic, data: M[Topic]) {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot publish data');
    }
    // publishing through JetStream (instead of core NATS) means we get a server
    // acknowledgement that the message was persisted to the stream
    await this.#js.publish(this.#topicToSubject(topic), JSON.stringify(data));
  }

  #subscribe<Topic extends keyof M>(
    topic: Topic,
    cursor: string | undefined,
  ): AsyncIterable<JetStreamTopicDataMap<M>[Topic]> {
    const subject = this.#topicToSubject(topic);
    const self = this;
    async function* generate(): AsyncGenerator<
      JetStreamTopicDataMap<M>[Topic]
    > {
      // an ordered consumer is a fresh ephemeral consumer, exactly what we want for a
      // resumable per-subscription cursor: no shared/durable state between subscribers
      const consumer = await self.#js.consumers.get(self.#stream, {
        filter_subjects: [subject],
        ...(cursor === undefined
          ? { deliver_policy: DeliverPolicy.New }
          : {
              deliver_policy: DeliverPolicy.StartSequence,
              opt_start_seq: self.#parseCursor(cursor) + 1,
            }),
      });
      const messages = await consumer.consume();
      const stop = async () => {
        self.#activeConsumers.delete(stop);
        await messages.close();
      };
      self.#activeConsumers.set(stop, topic);
      try {
        for await (const msg of messages) {
          yield {
            data: msg.json<M[Topic]>(),
            cursor: String(msg.seq),
          } as JetStreamTopicDataMap<M>[Topic];
        }
      } finally {
        await stop();
      }
    }
    return generate();
  }

  public subscribe<Topic extends keyof M>(
    topic: Topic,
    options: JetStreamSubscribeOptions,
  ): AsyncIterable<JetStreamTopicDataMap<M>[Topic]>;
  public subscribe<Topic extends keyof M>(
    topic: Topic,
    listener: PubSubListener<JetStreamTopicDataMap<M>, Topic>,
  ): MaybePromise<() => MaybePromise<void>>;
  public subscribe<Topic extends keyof M>(
    topic: Topic,
    // the two overloads above are structurally incompatible (mandatory options vs a listener
    // function) so the implementation signature has to be loosely typed and narrowed at runtime
    ...args: unknown[]
  ):
    | AsyncIterable<JetStreamTopicDataMap<M>[Topic]>
    | MaybePromise<() => MaybePromise<void>> {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot subscribe to topics');
    }

    const optionsOrListener = args[0] as
      | JetStreamSubscribeOptions
      | PubSubListener<JetStreamTopicDataMap<M>, Topic>;

    if (typeof optionsOrListener !== 'function') {
      return this.#subscribe(topic, optionsOrListener.cursor);
    }

    const listener = optionsOrListener;
    const iterator = this.#subscribe(topic, undefined)[Symbol.asyncIterator]();
    (async () => {
      for (;;) {
        const { value, done } = await iterator.next();
        if (done) return;
        listener(value);
      }
    })().catch(() => {
      // subscription ended (e.g. unsubscribed), nothing to do
    });

    return async () => {
      await iterator.return?.();
    };
  }

  public async dispose() {
    this.#disposed = true;
    await Promise.all(
      Array.from(this.#activeConsumers.keys()).map((stop) => stop()),
    );
    this.#activeConsumers.clear();
    if (this.#closeOnDispose) {
      await this.#nats.close();
    }
  }

  [DisposableSymbols.asyncDispose]() {
    return this.dispose();
  }
}
