---
'@graphql-hive/pubsub': patch
---

Accept a `JetStreamClient` in `NATSJetStreamPubSub` so the optional NATS dependencies remain type-only imports

```diff
-import { NATSJetStreamPubSub } from '@graphql-hive/pubsub/nats-jetstream';
+import { NATSJetStreamPubSub } from '@graphql-hive/pubsub/nats-jetstream';
+import { jetstream } from '@nats-io/jetstream';

-const pubsub = new NATSJetStreamPubSub(nats, options);
+const pubsub = new NATSJetStreamPubSub(jetstream(nats), options);
```
