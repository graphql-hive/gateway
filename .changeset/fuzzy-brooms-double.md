---
'@graphql-tools/executor-http': minor
---

Support factory function in `timeout` option so that you can set timeout milliseconds dynamically per `ExecutionRequest`;

```ts
buildHTTPExecutor({
  timeout: (request) => {
    if (request.operationName === 'BigQuery') {
      return 10000; // 10 seconds for the `BigQuery` operation
    }
    // Or infinite timeout for subscriptions
    if (request.operationType === 'subscription') {
      return undefined;
    }
    return 5000; // 5 seconds for other operations
  },
});
```