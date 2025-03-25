import { it, vi } from 'vitest';
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
