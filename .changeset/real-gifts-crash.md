---
'@graphql-tools/executor-http': patch
'@graphql-hive/gateway-runtime': patch
---

No need to handle event listeners inside HTTP Executor thanks to the improvements with `@graphql-tools/utils`'s `registerAbortSignalListener` to avoid Node.js warnings when multiple event listeners registered to an `AbortSignal`
