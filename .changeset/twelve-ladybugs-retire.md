---
'@graphql-mesh/transport-http-callback': patch
'@graphql-mesh/transport-common': patch
'@graphql-mesh/transport-http': patch
'@graphql-tools/executor-http': patch
'@graphql-mesh/fusion-runtime': patch
'@graphql-hive/gateway-runtime': patch
---

- In case of schema reload, throw `SCHEMA_RELOAD` error while recreating the transports and executors
- In case of shut down, throw `SHUTTING_DOWN` error while cleaning the transports and executors up

Previously, these errors are only thrown for subscriptions not it is thrown in other type of operations as well.
And previously the thrown errors during these two cleanup and restart process were cryptic, now the mentioned two errors above are thrown with more clear messages