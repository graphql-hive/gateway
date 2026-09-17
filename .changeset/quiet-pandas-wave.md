---
'@graphql-hive/gateway': patch
---

Close WebSocket clients with `1001 Going away` on shutdown

`useServer()`'s disposable was discarded and the deferred cleanup called `wsServer.close()` instead. `ws` does not close any clients from `close()` when it was constructed with `options.server`; it drops its listeners and waits for `clients.size` to reach zero. Nothing ever told the clients to go away, so the only thing ending a subscription was `server.closeAllConnections()` in the HTTP server's disposer, which destroys the sockets and surfaces to clients as a network error (`1006`) instead of a normal close.

The disposable is now used, and the WebSocket drain shares a disposer with the HTTP shutdown so it completes before the HTTP close is awaited. That ordering matters: `server.close()` does not call back while a socket is still upgraded, and `closeAllConnections()` cannot cut it short because it does not reach upgraded sockets either, so a live subscription would otherwise hold the shutdown open indefinitely.

`gracefulShutdownTimeout` now also bounds the closing handshake. A client that never answers is terminated once the window expires, rather than keeping `ws` waiting for its 30 second `closeTimeout`. With no drain window configured a one second floor applies, so the close frames still have time to flush.
