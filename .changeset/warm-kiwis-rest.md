---
'@graphql-hive/gateway': minor
---

Graceful HTTP shutdown with configurable drain timeout

Add `gracefulShutdownTimeout` to the config and default it to 30s. On SIGTERM/SIGINT the server stops accepting new connections and idles out keep-alive connections, letting active requests finish naturally. After the timeout expires, all remaining connections are force-closed.

Set to `0` to restore the previous behaviour of immediately closing all connections.
