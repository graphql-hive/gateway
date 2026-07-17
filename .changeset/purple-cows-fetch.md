---
'@graphql-hive/pubsub': minor
---

Add `NATSJetStreamPubSub`, a NATS JetStream transport with optional cursor-based replay

Subscribe like any other Hive PubSub, or pass subscribe options to receive each message with an opaque `cursor`. Pass that cursor on a later subscription to resume right after it and recover events missed while disconnected. Without a cursor, only messages published after the subscription starts are delivered.

The JetStream stream is not created or configured by this transport; it must already exist and capture the subjects used by the pubsub (`${subjectPrefix}:${topic}`).

```ts
import { connect } from '@nats-io/transport-node';
import { NATSJetStreamPubSub } from '@graphql-hive/pubsub/nats-jetstream';

const nats = await connect({ servers: 'localhost:4222' });
const pubsub = new NATSJetStreamPubSub(nats, {
  subjectPrefix: 'my-service',
  stream: 'EVENTS',
});

// live-only: no cursor, only messages published after subscribe starts
const live = pubsub.subscribe('personCreated', { cursor: undefined });
const first = await live.next();
// first.value => { data: { id: '1' }, cursor: '...' }
await live.return?.();

// published while disconnected is retained by JetStream
await pubsub.publish('personCreated', { id: '2' });

// resume right after the last seen cursor — gets { id: '2' }, not a repeat of '1'
for await (const { data, cursor } of pubsub.subscribe('personCreated', {
  cursor: first.value.cursor,
})) {
  // persist `cursor` so the next reconnect can resume again
}
```
