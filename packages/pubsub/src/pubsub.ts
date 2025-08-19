import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';

export type TopicDataMap = Record<string, any>;

export interface HivePubSub<Data extends TopicDataMap = TopicDataMap> {
  /** @deprecated Please use {@link subscribedTopics} if implemented instead. This method will be removed in next major release. */
  getEventNames(): Iterable<keyof Data>;
  /** @important This method will be required starting next major release. */
  subscribedTopics?(): Iterable<keyof Data>;
  publish<Topic extends keyof Data>(topic: Topic, data: Data[Topic]): void;
  subscribe<Topic extends keyof Data>(
    topic: Topic,
    listener: PubSubListener<Data, Topic>,
  ): number;
  unsubscribe(subId: number): void;
  asyncIterator<Topic extends keyof Data>(
    topic: Topic,
  ): AsyncIterable<Data[Topic]>;
  /** @important This method will be required starting next major release. */
  dispose?(): void;
  /** @important This method will be required starting next major release. */
  [DisposableSymbols.dispose]?(): void;
}

export type PubSubListener<
  Data extends TopicDataMap,
  Topic extends keyof Data,
> = (data: Data[Topic]) => void;

export class PubSub<Data extends TopicDataMap = TopicDataMap>
  implements HivePubSub<Data>
{
  #topicListeners = new Map<keyof Data, Set<PubSubListener<Data, any>>>();
  #subIdTopic = new Map<number, any>();
  #subIdListeners = new Map<number, PubSubListener<Data, any>>();

  /** @deprecated Please use {@link subscribedTopics} instead. */
  public getEventNames() {
    return this.#topicListeners.keys();
  }

  public subscribedTopics() {
    return this.#topicListeners.keys();
  }

  public publish<Topic extends keyof Data>(topic: Topic, data: Data[Topic]) {
    const listeners = this.#topicListeners.get(topic);
    if (listeners) {
      for (const l of listeners) {
        l(data);
      }
    }
  }

  public subscribe<Topic extends keyof Data>(
    topic: Topic,
    listener: PubSubListener<Data, Topic>,
  ) {
    let listeners = this.#topicListeners.get(topic);
    if (!listeners) {
      listeners = new Set<PubSubListener<Data, Topic>>();
      this.#topicListeners.set(topic, listeners);
    }
    listeners.add(listener);

    const subId = Math.floor(Math.random() * 100_000_000);
    this.#subIdTopic.set(subId, topic);
    this.#subIdListeners.set(subId, listener);

    return subId;
  }

  public unsubscribe(subId: number): void {
    const listener = this.#subIdListeners.get(subId);
    if (!listener) {
      return; // already unsubscribed
    }
    this.#subIdListeners.delete(subId);

    const topic = this.#subIdTopic.get(subId);
    if (!topic) {
      return; // should not happen TODO: throw?
    }
    this.#subIdTopic.delete(subId);

    const listeners = this.#topicListeners.get(topic);
    if (!listeners) {
      return; // should not happen TODO: throw?
    }

    listeners.delete(listener);
    if (listeners.size === 0) {
      this.#topicListeners.delete(topic);
    }
  }

  #asyncIteratorStops = new Set<() => void>();

  public asyncIterator<Topic extends keyof Data>(
    topic: Topic,
  ): AsyncIterable<Data[Topic]> {
    return new Repeater(async (push, stop) => {
      const subId = this.subscribe(topic, push);
      this.#asyncIteratorStops.add(stop);
      await stop;
      this.#asyncIteratorStops.delete(stop);
      this.unsubscribe(subId);
    });
  }

  public dispose() {
    this.#topicListeners.clear();
    this.#subIdListeners.clear();
    this.#subIdTopic.clear();
    for (const stop of this.#asyncIteratorStops) {
      stop();
    }
    this.#asyncIteratorStops.clear();
  }

  [DisposableSymbols.dispose]() {
    this.dispose();
  }
}
