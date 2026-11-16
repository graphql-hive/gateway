---
'@graphql-hive/logger': patch
---

Ignore the `LOG_LEVEL` environment variable when an explicit `level` is provided, and fall back to the default level instead of throwing when `LOG_LEVEL` is not a valid log level

This allows using the logger in environments where `LOG_LEVEL` belongs to another logger (like pino with `LOG_LEVEL=fatal`).
