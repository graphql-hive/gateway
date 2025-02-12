---
'@graphql-mesh/transport-http-callback': patch
'@graphql-mesh/plugin-opentelemetry': patch
'@graphql-mesh/fusion-runtime': patch
'@graphql-mesh/transport-ws': patch
'@graphql-hive/importer': patch
'@graphql-hive/gateway': patch
'@graphql-hive/gateway-runtime': patch
'@graphql-hive/logger-json': patch
---

New JSON-based logger

By default, it prints pretty still to the console unless NODE_ENV is production.
For JSON output, set the `LOG_FORMAT` environment variable to `json`.