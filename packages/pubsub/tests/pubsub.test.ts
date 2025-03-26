import LeakDetector from 'jest-leak-detector';
import { expect, it, vi } from 'vitest';
import { PubSub } from '../src/pubsub';

it('should respect topic data generic', () => {
  using pubsub = new PubSub<{ hello: 'world'; obj: Record<string, any> }>();

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

it('should publish to relevant subscribers', () => {
  using pubsub = new PubSub();

  const helloCb = vi.fn();
  pubsub.subscribe('hello', helloCb);

  const helloCb2 = vi.fn();
  pubsub.subscribe('hello', helloCb2);

  const alohaCb = vi.fn();
  pubsub.subscribe('alloha', alohaCb);

  pubsub.publish('hello', 'world');

  expect(helloCb).toHaveBeenCalledTimes(1);
  expect(helloCb2).toHaveBeenCalledTimes(1);
  expect(alohaCb).not.toHaveBeenCalled();
});

it('should not receive topics after unsubscribe', () => {
  using pubsub = new PubSub();

  const helloCb = vi.fn();
  const subId = pubsub.subscribe('hello', helloCb);

  pubsub.publish('hello', 'world');

  pubsub.unsubscribe(subId);

  pubsub.publish('hello', 'world');

  expect(helloCb).toHaveBeenCalledTimes(1);
});

it('should not receive topics after dispose', () => {
  const pubsub = new PubSub();

  const helloCb = vi.fn();
  pubsub.subscribe('hello', helloCb);

  pubsub.publish('hello', 'world');

  pubsub.dispose();

  pubsub.publish('hello', 'world');

  expect(helloCb).toHaveBeenCalledTimes(1);
});

it('should return async iterables after dispose', async () => {
  const pubsub = new PubSub();

  const iter = (async () => {
    for await (const _data of pubsub.asyncIterator('hello')) {
    }
    // wont break if not disposed
  })();

  pubsub.dispose();

  await expect(iter).resolves.toBeUndefined();
});

it.skipIf(
  // leak detector doesnt work with bun because setFlagsFromString is not yet implemented in Bun
  // we also assume that bun doesnt leak
  globalThis.Bun,
)('should GC listener after unsubscribe', async () => {
  const pubsub = new PubSub();

  let cb: null | (() => void) = () => {
    // noop
  };
  const cbDetector = new LeakDetector(cb);

  const subId = pubsub.subscribe('hello', cb);

  pubsub.publish('hello', 'world');

  cb = null;

  await expect(cbDetector.isLeaking()).resolves.toBeTruthy(); // since not yet unsubscribed

  pubsub.unsubscribe(subId);

  await expect(cbDetector.isLeaking()).resolves.toBeFalsy(); // unsubscribed
});
