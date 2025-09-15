# @graphql-hive/pubsub

## 2.1.1
### Patch Changes



- [#1473](https://github.com/graphql-hive/gateway/pull/1473) [`838ffec`](https://github.com/graphql-hive/gateway/commit/838ffecb2ad3d4ef6bbb65607a56302cb45e2f14) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@whatwg-node/promise-helpers@^1.3.2` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.3.2) (from `^1.3.0`, in `dependencies`)

## 2.1.0
### Minor Changes



- [#1441](https://github.com/graphql-hive/gateway/pull/1441) [`2b3946f`](https://github.com/graphql-hive/gateway/commit/2b3946f418b0fb018ca792ff6a2c14fef7abb01d) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Close the client connection on NATS and Redis pubsubs on dispose
  
  This will gracefully dispose the pubsub on gateway shutdown. There is an option to disable this behaviour `noCloseOnDispose` and `noQuitOnDispose` respectively.

## 2.0.0
### Major Changes



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Drop Node 18 support
  
  Least supported Node version is now v20.


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Complete API redesign with async support and distributed Redis PubSub
  
  ## Redesigned interface
  
  ```ts
  import type { DisposableSymbols } from '@whatwg-node/disposablestack';
  import type { MaybePromise } from '@whatwg-node/promise-helpers';
  
  export type TopicDataMap = { [topic: string]: any /* data */ };
  
  export type PubSubListener<
    Data extends TopicDataMap,
    Topic extends keyof Data,
  > = (data: Data[Topic]) => void;
  
  export interface PubSub<M extends TopicDataMap = TopicDataMap> {
    /**
     * Publish {@link data} for a {@link topic}.
     * @returns `void` or a `Promise` that resolves when the data has been successfully published
     */
    publish<Topic extends keyof M>(
      topic: Topic,
      data: M[Topic],
    ): MaybePromise<void>;
    /**
     * A distinct list of all topics that are currently subscribed to.
     * Can be a promise to accomodate distributed systems where subscribers exist on other
     * locations and we need to know about all of them.
     */
    subscribedTopics(): MaybePromise<Iterable<keyof M>>;
    /**
     * Subscribe and listen to a {@link topic} receiving its data.
     *
     * If the {@link listener} is provided, it will be called whenever data is emitted for the {@link topic},
     *
     * @returns an unsubscribe function or a `Promise<unsubscribe function>` that resolves when the subscription is successfully established. the unsubscribe function returns `void` or a `Promise` that resolves on successful unsubscribe and subscription cleanup
     *
     * If the {@link listener} is not provided,
     *
     * @returns an `AsyncIterable` that yields data for the given {@link topic}
     */
    subscribe<Topic extends keyof M>(topic: Topic): AsyncIterable<M[Topic]>;
    subscribe<Topic extends keyof M>(
      topic: Topic,
      listener: PubSubListener<M, Topic>,
    ): MaybePromise<() => MaybePromise<void>>;
    /**
     * Closes active subscriptions and disposes of all resources. Publishing and subscribing after disposal
     * is not possible and will throw an error if attempted.
     */
    dispose(): MaybePromise<void>;
    /** @see {@link dispose} */
    [DisposableSymbols.asyncDispose](): Promise<void>;
  }
  ```
  
  ## New `NATSPubSub` for a NATS-powered pubsub
  
  ```sh
  npm i @nats-io/transport-node
  ```
  
  ```ts filename="gateway.config.ts"
  import { defineConfig } from '@graphql-hive/gateway';
  import { NATSPubSub } from '@graphql-hive/pubsub/nats';
  import { connect } from '@nats-io/transport-node';
  
  export const gatewayConfig = defineConfig({
    maskedErrors: false,
    pubsub: new NATSPubSub(
      await connect(),
      {
        // we make sure to use the same prefix for all gateways to share the same channels and pubsub.
        // meaning, all gateways using this channel prefix will receive and publish to the same topics
        subjectPrefix: 'my-app',
      },
    ),
  });
  ```
  
  ## New `RedisPubSub` for a Redis-powered pubsub
  
  ```sh
  npm i ioredis
  ```
  
  ```ts
  import { RedisPubSub } from '@graphql-hive/pubsub/redis';
  import Redis from 'ioredis';
  
  /**
   * When a Redis connection enters "subscriber mode" (after calling SUBSCRIBE), it can only execute
   * subscriber commands (SUBSCRIBE, UNSUBSCRIBE, etc.). Meaning, it cannot execute other commands like PUBLISH.
   * To avoid this, we use two separate Redis clients: one for publishing and one for subscribing.
   */
  const pub = new Redis();
  const sub = new Redis();
  
  const pubsub = new RedisPubSub(
    { pub, sub },
    // if the chanel prefix is the shared between services, the topics will be shared as well
    // this means that if you have multiple services using the same channel prefix, they will
    // receive each other's messages
    { channelPrefix: 'my-app' }
  );
  ```
  
  ## Migrating
  
  The main migration effort involves:
  1. Updating import statements
  2. Adding `await` to async operations
  3. Replacing subscription ID pattern with unsubscribe functions
  4. Replacing `asyncIterator()` with overloaded `subscribe()`
  5. Choosing between `MemPubSub` and `RedisPubSub` implementations
  6. Using the `PubSub` interface instead of `HivePubSub`
  
  Before:
  
  ```typescript
  import { PubSub, HivePubSub } from '@graphql-hive/pubsub';
  
  interface TopicMap {
    userCreated: { id: string; name: string };
    orderPlaced: { orderId: string; amount: number };
  }
  
  const pubsub: HivePubSub<TopicMap> = new PubSub();
  
  // Subscribe
  const subId = pubsub.subscribe('userCreated', (user) => {
    console.log('User created:', user.name);
  });
  
  // Publish
  pubsub.publish('userCreated', { id: '1', name: 'John' });
  
  // Async iteration
  (async () => {
    for await (const order of pubsub.asyncIterator('orderPlaced')) {
      console.log('Order placed:', order.orderId);
    }
  })();
  
  // Get topics
  const topics = pubsub.getEventNames();
  
  // Unsubcribe
  pubsub.unsubscribe(subId);
  
  // Dispose/destroy the pubsub
  pubsub.dispose();
  ```
  
  After:
  
  ```typescript
  import { MemPubSub, PubSub } from '@graphql-hive/pubsub';
  
  interface TopicMap {
    userCreated: { id: string; name: string };
    orderPlaced: { orderId: string; amount: number };
  }
  
  const pubsub: PubSub<TopicMap> = new MemPubSub();
  
  // Subscribe
  const unsubscribe = await pubsub.subscribe('userCreated', (user) => {
    console.log('User created:', user.name);
  });
  
  // Publish
  await pubsub.publish('userCreated', { id: '1', name: 'John' });
  
  // Async iteration
  (async () => {
    for await (const order of pubsub.subscribe('orderPlaced')) {
      console.log('Order placed:', order.orderId);
    }
  })();
  
  // Get topics
  const topics = await pubsub.subscribedTopics();
  
  // Unsubscribe
  await unsubscribe();
  
  // Dispose/destroy the pubsub
  await pubsub.dispose();
  ```
  
  ### Interface renamed from `HivePubSub` to just `PubSub`
  
  ```diff
  - import { HivePubSub } from '@graphql-hive/pubsub';
  + import { PubSub } from '@graphql-hive/pubsub';
  ```
  
  ### `subscribedTopics()` method signature change
  
  This method is now required and supports async operations.
  
  ```diff
  - subscribedTopics?(): Iterable; // Optional
  + subscribedTopics(): MaybePromise<Iterable>; // Required, supports async
  ```
  
  ### `publish()` method signature change
  
  Publishing can now be async and may return a promise.
  
  ```diff
  - publish<Topic extends keyof Data>(topic: Topic, data: Data[Topic]): void;
  + publish<Topic extends keyof M>(topic: Topic, data: M[Topic]): MaybePromise<void>;
  ```
  
  Migrating existing code:
  
  ```diff
  - pubsub.publish('topic', data);
  + await pubsub.publish('topic', data);
  ```
  
  ### `subscribe()` method signature change
  
  Subscribe now returns an unsubscribe function instead of a subscription ID.
  
  ```diff
    subscribe<Topic extends keyof Data>(
      topic: Topic,
      listener: PubSubListener<Data, Topic>
  - ): number; // Returns subscription ID
  + ): MaybePromise<() => MaybePromise<void>>; // Returns unsubscribe function
  ```
  
  Migrating existing code:
  
  ```diff
  - const subId = pubsub.subscribe('topic', (data) => {
  -   console.log(data);
  - });
  - pubsub.unsubscribe(subId);
  + const unsubscribe = await pubsub.subscribe('topic', (data) => {
  +   console.log(data);
  + });
  + await unsubscribe();
  ```
  
  ### `dispose()` method signature change
  
  Disposal is now required and supports async operations.
  
  ```diff
  - dispose?(): void; // Optional
  + dispose(): MaybePromise<void>; // Required, supports async
  ```
  
  Migrating existing code:
  
  ```diff
  - pubsub.dispose();
  + await pubsub.dispose();
  ```
  
  ### Removed `getEventNames()` method
  
  This deprecated method was removed. Use `subscribedTopics()` instead.
  
  ```diff
  - getEventNames(): Iterable<keyof Data>;
  ```
  
  Migrating existing code:
  
  ```diff
  - const topics = pubsub.getEventNames();
  + const topics = await pubsub.subscribedTopics();
  ```
  
  ### Removed `unsubscribe()` method
  
  The centralized unsubscribe method was removed. Each subscription now returns its own unsubscribe function.
  
  ```diff
  - unsubscribe(subId: number): void;
  ```
  
  Migrating existing code by using the unsubscribe function returned by `subscribe()` instead:
  
  ```diff
  - const subId = pubsub.subscribe('topic', listener);
  - pubsub.unsubscribe(subId);
  
  + const unsubscribe = await pubsub.subscribe('topic', listener);
  + await unsubscribe();
  ```
  
  ### Removed `asyncIterator()` Method
  
  The separate async iterator method was removed. Call `subscribe()` without a listener to get an async iterable.
  
  ```diff
  - asyncIterator<Topic extends keyof Data>(topic: Topic): AsyncIterable<Data[Topic]>;
  ```
  
  Migrating existing code:
  
  ```diff
  - for await (const data of pubsub.asyncIterator('topic')) {
  + for await (const data of pubsub.subscribe('topic')) {
       console.log(data);
     }
  ```
  
  ### `MemPubSub` is the in-memory pubsub implementation
  
  The generic `PubSub` class was replaced with implementation specific `MemPubSub` for an in-memory pubsub.
  
  ```diff
  - import { PubSub } from '@graphql-hive/pubsub';
  - const pubsub = new PubSub();
  + import { MemPubSub } from '@graphql-hive/pubsub';
  + const pubsub = new MemPubSub();
  ```

### Patch Changes



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - dependencies updates:
  
  - Added dependency [`@whatwg-node/promise-helpers@^1.3.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.3.0) (to `dependencies`)
  - Added dependency [`@nats-io/nats-core@^3` ↗︎](https://www.npmjs.com/package/@nats-io/nats-core/v/3.0.0) (to `peerDependencies`)
  - Added dependency [`ioredis@^5` ↗︎](https://www.npmjs.com/package/ioredis/v/5.0.0) (to `peerDependencies`)


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - dependencies updates:
  
  - Added dependency [`@whatwg-node/promise-helpers@^1.3.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.3.0) (to `dependencies`)
  - Added dependency [`@nats-io/nats-core@^3` ↗︎](https://www.npmjs.com/package/@nats-io/nats-core/v/3.0.0) (to `peerDependencies`)
  - Added dependency [`ioredis@^5` ↗︎](https://www.npmjs.com/package/ioredis/v/5.0.0) (to `peerDependencies`)


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Export TopicDataMap type for easier external implementations

## 1.0.0

### Major Changes

- [#933](https://github.com/graphql-hive/gateway/pull/933) [`a374bfc`](https://github.com/graphql-hive/gateway/commit/a374bfcf4309f5953b8c8304fba8e079b6f6b6dc) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Introduce Hive Gateway PubSub with hardened memory safety
