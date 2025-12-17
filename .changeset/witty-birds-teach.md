---
'@graphql-hive/gateway': minor
---

Added `@graphql-hive/gateway/opentelemetry/attributes` module entrypoint exposing graphql and hive
specific attributes. This was already exposed by the default entrypoint, but it now also has its own one.

This fixes an issue with some bundler (like vite) that doesn't support importing non existent `.js`
when only a `.d.ts` file exists.
