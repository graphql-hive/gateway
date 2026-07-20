import type { JetStreamClient, JsMsg } from '@nats-io/jetstream';
import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import {
  createDeferredPromise,
  fakePromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
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

/** Subscribe options for {@link NATSJetStreamPubSub}, omit to only receive new messages. */
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
}

/**
 * {@link PubSub Hive PubSub} implementation using [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream)
 * persisted streams.
 *
 * Subscribe normally to receive published data like any other {@link PubSub}. Pass subscribe
 * options to receive the data alongside an opaque `cursor`. Passing that cursor back on a later
 * subscription resumes delivery right after it, allowing subscribers to recover events missed
 * while disconnected.
 */
export class NATSJetStreamPubSub<
  M extends TopicDataMap = TopicDataMap,
> implements PubSub<M, JetStreamSubscribeOptions> {
  #disposed = false;
  #js: JetStreamClient;
  #subjectPrefix: string;
  #stream: string;
  #activeConsumers = new Map<() => Promise<void>, keyof M>();

  constructor(js: JetStreamClient, options: NATSJetStreamPubSubOptions) {
    this.#js = js;
    this.#subjectPrefix = options.subjectPrefix;
    this.#stream = options.stream;
    if (String(this.#subjectPrefix || '').trim() === '') {
      throw new Error('NATSJetStreamPubSub requires a non-empty subjectPrefix');
    }
    if (String(this.#stream || '').trim() === '') {
      throw new Error('NATSJetStreamPubSub requires a non-empty stream');
    }
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

  public publish<Topic extends keyof M>(topic: Topic, data: M[Topic]) {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot publish data');
    }
    // publishing through JetStream (instead of core NATS) means we get a server
    // acknowledgement that the message was persisted to the stream
    return this.#js
      .publish(this.#topicToSubject(topic), JSON.stringify(data))
      .then(() => undefined);
  }

  /**
   * An ordered consumer is a fresh ephemeral consumer, exactly what we want for a resumable
   * per-subscription cursor: no shared/durable state between subscribers.
   */
  #createConsumer(topic: keyof M, cursor: string | undefined) {
    return this.#js.consumers.get(this.#stream, {
      filter_subjects: [this.#topicToSubject(topic)],
      ...(cursor === undefined
        ? { deliver_policy: 'new' }
        : {
            deliver_policy: 'by_start_sequence',
            opt_start_seq: this.#parseCursor(cursor) + 1,
          }),
    });
  }

  async #consume(
    topic: keyof M,
    cursor: string | undefined,
    callback: (msg: JsMsg) => void,
    finished?: () => void,
    closed?: {
      resolve: () => void;
      reject: (error: unknown) => void;
    },
  ) {
    const consumer = await this.#createConsumer(topic, cursor);
    const messages = await consumer.consume({ callback });
    const stop = async () => {
      if (this.#activeConsumers.delete(stop)) {
        try {
          await messages.close();
        } finally {
          finished?.();
        }
      }
    };
    if (this.#disposed) {
      await messages.close();
      finished?.();
      throw new Error('PubSub is disposed');
    }
    this.#activeConsumers.set(stop, topic);
    if (closed) {
      void messages
        .closed()
        .then((error) => (error ? closed.reject(error) : closed.resolve()));
    }
    return stop;
  }

  public subscribe<Topic extends keyof M>(
    topic: Topic,
  ): AsyncIterable<M[Topic]>;
  public subscribe<Topic extends keyof M>(
    topic: Topic,
    options: JetStreamSubscribeOptions,
  ): AsyncIterable<JetStreamTopicDataMap<M>[Topic]>;
  public subscribe<Topic extends keyof M>(
    topic: Topic,
    listener: PubSubListener<M, Topic>,
  ): MaybePromise<() => MaybePromise<void>>;
  public subscribe<Topic extends keyof M>(
    topic: Topic,
    // the two overloads above are structurally incompatible (mandatory options vs a listener
    // function) so the implementation signature has to be loosely typed and narrowed at runtime
    optionsOrListener?: JetStreamSubscribeOptions | PubSubListener<M, Topic>,
  ):
    | AsyncIterable<M[Topic] | JetStreamTopicDataMap<M>[Topic]>
    | MaybePromise<() => MaybePromise<void>> {
    if (this.#disposed) {
      throw new Error('PubSub is disposed, cannot subscribe to topics');
    }

    if (typeof optionsOrListener === 'function') {
      // null out on unsubscribe so the listener can be GC'd (nats client may retain the callback)
      const listenerRef = {
        ref: optionsOrListener as typeof optionsOrListener | null,
      };
      // resolves only once the subscription is actually established, no need to wait/retry
      const stop = this.#consume(topic, undefined, (msg) => {
        try {
          listenerRef.ref?.(msg.json<M[Topic]>());
        } catch {
          // listener subscriptions have no error channel
        }
      });
      return fakePromise(stop).then((stop) => async () => {
        listenerRef.ref = null;
        await stop();
      });
    }

    // consumer creation starts on the first pull, so callers must wait for the subscription
    // to be established before publishing when they cannot afford to miss the first message
    return new Repeater<JetStreamTopicDataMap<M>[Topic], any, any>(
      async (push, stopped) => {
        const consumerClosed = createDeferredPromise<void>();
        const stop = await this.#consume(
          topic,
          optionsOrListener?.cursor,
          (msg) => {
            try {
              const item: JetStreamTopicDataMap<M>[Topic] = {
                data: msg.json<M[Topic]>(),
                cursor: String(msg.seq),
              };
              void push(item);
            } catch (error) {
              consumerClosed.reject(error);
            }
          },
          stopped,
          consumerClosed,
        );
        try {
          await Promise.race([stopped, consumerClosed.promise]);
        } finally {
          consumerClosed.resolve();
          await stop();
        }
        // subscription ended (e.g. unsubscribed), nothing to do
      },
    );
  }

  public async dispose() {
    this.#disposed = true;
    await Promise.all(
      Array.from(this.#activeConsumers.keys()).map((stop) => stop()),
    );
    this.#activeConsumers.clear();
  }

  [DisposableSymbols.asyncDispose]() {
    return this.dispose();
  }
}
