---
'@graphql-tools/executor-http': minor
---

`endpoint` can now also be a factory function that returns the endpoint based on the `ExecutionRequest`. This allows creating dynamic endpoints, depending on environment variables or other runtime values.
