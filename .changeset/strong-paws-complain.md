---
'@graphql-mesh/plugin-opentelemetry': patch
'@graphql-hive/gateway': patch
---

Patch the `@opentelemetry/sdk-trace-base` package to fix span start time precision being millisecond instead of nanosecond.
