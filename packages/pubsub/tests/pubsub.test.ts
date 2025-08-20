import { setTimeout } from 'timers/promises';
import { Container, createTenv } from '@internal/e2e';
import { createDeferredPromise } from '@whatwg-node/promise-helpers';
import Redis from 'ioredis';
import LeakDetector from 'jest-leak-detector';
import { describe, expect, it, vi } from 'vitest';
import { MemPubSub } from '../src/mem';
import { PubSub as IPubSub, TopicDataMap } from '../src/pubsub';
import { RedisPubSub } from '../src/redis';

const PubSubCtors = [MemPubSub, RedisPubSub];

for (const PubSub of PubSubCtors) {
  describe(PubSub.name, async () => {
    let redis: Container | null = null;
    if (PubSub === RedisPubSub) {
      const { container } = createTenv(__dirname);
      redis = await container({
        name: 'redis',
        image: 'redis:8',
        containerPort: 6379,
        healthcheck: ['CMD-SHELL', 'redis-cli ping'],
        env: {
          LANG: '', // fixes "Failed to configure LOCALE for invalid locale name."
        },
      });
    }

    /** Imitates a flush of data/operations by simply waiting, if the pubsub is async, like Redis. */
    function flush(ms: number = 100) {
      if (PubSub === MemPubSub) {
        // MemPubSub is synchronous, no need to wait
        return Promise.resolve();
      }
      return setTimeout(ms);
    }

    async function createPubSub<Data extends TopicDataMap>(): Promise<
      IPubSub<Data>
    > {
      if (PubSub === MemPubSub) {
        return new MemPubSub<Data>();
      }
      if (PubSub === RedisPubSub) {
        if (!redis) {
          throw new Error('Redis container is not initialized');
        }
        const pub = new Redis({ port: redis.port, lazyConnect: false });
        pub.once('error', () => {});
        const sub = new Redis({ port: redis.port, lazyConnect: false });
        sub.once('error', () => {});
        // await pub.connect();
        // await sub.connect();
        return new RedisPubSub<Data>({ pub, sub });
      }
      throw new Error(`Unsupported PubSub implementation: ${PubSub.name}`);
    }

    it('should respect topic data generic', async () => {
      await using pubsub = await createPubSub<{
        hello: 'world';
        obj: Record<string, any>;
      }>();

      pubsub.publish('hello', 'world');

      pubsub.publish(
        'hello',
        // @ts-expect-error must be 'world'
        0,
      );

      pubsub.publish(
        // @ts-expect-error does not exist in map
        'aloha',
        0,
      );

      pubsub.publish('obj', {});

      pubsub.publish(
        'obj',
        // @ts-expect-error must be an object
        '{}',
      );

      pubsub.subscribe('hello', (data) => {
        // @ts-expect-error must be 'world'
        data();
      });

      pubsub.subscribe(
        // @ts-expect-error does not exist in map
        'aloha',
        () => {},
      );
    });

    it('should publish to relevant subscribers', async () => {
      await using pubsub = await createPubSub();

      const { resolve: hello1Cb, promise: hello1 } = createDeferredPromise();
      await pubsub.subscribe('hello', hello1Cb);

      const { resolve: hello2Cb, promise: hello2 } = createDeferredPromise();
      await pubsub.subscribe('hello', hello2Cb);

      const { resolve: allohaCb, promise: alloha } = createDeferredPromise();
      await pubsub.subscribe('alloha', allohaCb);

      await pubsub.publish('hello', 'world');

      await expect(hello1).resolves.toBe('world');
      await expect(hello2).resolves.toBe('world');
      await Promise.race([
        alloha.then(() => {
          throw new Error('alloha should not have resolved');
        }),
        flush(),
      ]);
    });

    it('should not receive topics after unsubscribe', async () => {
      await using pubsub = await createPubSub();

      const helloCb = vi.fn();
      const unsub = await pubsub.subscribe('hello', helloCb);

      // let the events flush before checking
      await flush();

      await pubsub.publish('hello', 'world');

      await unsub();

      await pubsub.publish('hello', 'world');

      // let the events flush before checking
      await flush();

      expect(helloCb).toHaveBeenCalledTimes(1);
    });

    it('should not receive topics after dispose', async () => {
      const pubsub = await createPubSub();

      const helloCb = vi.fn();
      await pubsub.subscribe('hello', helloCb);

      // let the events flush before checking
      await flush();

      await pubsub.publish('hello', 'world');

      await pubsub.dispose();

      expect(() => pubsub.publish('hello', 'world')).toThrow();

      // let the events flush before checking
      await flush();

      expect(helloCb).toHaveBeenCalledTimes(1);
    });

    it('should return async iterables after dispose', async () => {
      const pubsub = await createPubSub();

      const { resolve: receive, promise: received } = createDeferredPromise();
      const iter = (async () => {
        for await (const _data of pubsub.subscribe('hello')) {
          receive();
        }
        // wont break if not disposed
      })();

      // we wait for the iterator to start i.e. to subscribe
      let subscribed = false;
      for (;;) {
        subscribed = await Promise.race([
          received.then(() => true),
          flush().then(() => false),
        ]);
        if (subscribed) break;
        await pubsub.publish('hello', 'world');
      }

      await pubsub.dispose();

      await expect(iter).resolves.toBeUndefined();
    });

    // TODO: test the same but for iterator
    it.skipIf(
      // leak detector doesnt work with bun because setFlagsFromString is not yet implemented in Bun
      // we also assume that bun doesnt leak
      globalThis.Bun,
    )('should GC listener after unsubscribe', async () => {
      const pubsub = await createPubSub();

      let cb: null | (() => void) = () => {
        // noop
      };
      const cbDetector = new LeakDetector(cb);

      const unsub = await pubsub.subscribe('hello', cb);

      await pubsub.publish('hello', 'world');

      cb = null;

      await expect(cbDetector.isLeaking()).resolves.toBeTruthy(); // since not yet unsubscribed

      await unsub();

      await expect(cbDetector.isLeaking()).resolves.toBeFalsy(); // unsubscribed
    });
  });
}
