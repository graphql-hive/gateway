---
'@graphql-hive/plugin-opentelemetry': patch
---

Moves the `configureDiagLogger` option from plugin to `openTelemetrySetup` utility. This fixes missing first logs, and allows us to correlate Hive log level with OTEL log level.
