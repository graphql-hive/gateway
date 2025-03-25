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
