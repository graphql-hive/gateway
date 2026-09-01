---
'@graphql-hive/gateway': minor
---

Support the `HOST` environment variable for the `--host` CLI option

The `--host` option can now be configured through the `HOST` environment variable, matching the existing behaviour of `--port` / `PORT` and the other global CLI options.

```sh
HOST=127.0.0.1 PORT=4000 hive-gateway supergraph
```
