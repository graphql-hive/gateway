---
'@graphql-tools/executor-http': major
'@graphql-mesh/transport-http-callback': minor
'@graphql-hive/gateway-runtime': minor
'@graphql-tools/federation': patch
---

- **BREAKING**: HTTP Executor no longer takes `serviceName` as an option.
- Both HTTP executor and `@graphql-mesh/transport-http-callback` no longer handle `DOWNSTREAM_SERVICE_ERROR` error code with `serviceName`.
- Gateway runtime handles subgraph errors on its own with `DOWNSTREAM_SERVICE_ERROR` error code and `serviceName` as a property. This behavior can be configured with `subgraphErrors` option of the `createGatewayRuntime` function or CLI config.

```ts
subgraphError: {
   errorCode: 'DOWNSTREAM_SERVICE_ERROR', // or `false` to remove this code completely
   subgraphNameProp: 'serviceName' // or `false` to remove this prop completely
}
```