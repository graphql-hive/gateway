---
'@graphql-hive/gateway': minor
---

Add `websocketDrainTimeout` to spread WebSocket closes across a shutdown

Closing every client at once sends the whole fleet into its reconnect backoff together. `graphql-ws` retries a `1001` close just as it does a network error, and its default first retry waits only 1.3-4 seconds, so a large fleet comes back within a few seconds of itself however cleanly it was closed.

With `websocketDrainTimeout` set, clients are closed in batches of roughly a second each across the window instead:

```ts
export const gatewayConfig = defineConfig({
  websocketDrainTimeout: 20_000,
  gracefulShutdownTimeout: 5_000,
});
```

`gracefulShutdownTimeout` still bounds the closing handshake of the last batch, so a shutdown can take as long as both together. Defaults to `0`, which closes every client at once as before.
