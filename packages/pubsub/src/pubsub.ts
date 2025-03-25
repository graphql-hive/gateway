import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';

type TopicDataMap = {
  [key: string]: any;
};

export type PubSubListener<
  Data extends TopicDataMap,
  Topic extends keyof Data,
> = (data: Data[Topic]) => void;

export class PubSub<Data extends TopicDataMap = TopicDataMap> {
  #topicListeners = new Map<keyof Data, Set<PubSubListener<Data, any>>>();
  #subIdTopic = new Map<number, any>();
  #subIdListeners = new Map<number, PubSubListener<Data, any>>();

  /** @deprecated Please use {@link subscribedTopics} instead. */
  public getEventNames(): Iterable<keyof Data> {
    return this.#topicListeners.keys();
  }

  public subscribedTopics(): Iterable<keyof Data> {
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

    const listeners = this.#topicListeners.get(topic);
    if (!listeners) {
      return; // should not happen TODO: throw?
    }

    listeners.delete(listener);
    if (listeners.size === 0) {
      this.#topicListeners.delete(topic);
    }
  }

  public asyncIterator<Topic extends keyof Data>(
    topic: Topic,
  ): AsyncIterable<Data[Topic]> {
    return new Repeater(async (push, stop) => {
      const subId = this.subscribe(topic, push);
      await stop;
      this.unsubscribe(subId);
    });
  }

  [DisposableSymbols.dispose]() {
    this.#topicListeners.clear();
    this.#subIdListeners.clear();
    this.#subIdTopic.clear();
    // TODO: return all async iterators on dispose
  }
}
