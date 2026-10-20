---
'@graphql-hive/gateway-runtime': minor
---

Expose Yoga's `maxRequestBodySize` option in the gateway configuration. The default limit is 25,000,000 bytes

Set a different byte limit, or use `false` to disable it:

```ts
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';

const gateway = createGatewayRuntime({
  supergraph,
  maxRequestBodySize: 5_000_000,
});
```

Enforcing the limit streams request bodies through a byte counter, making POST body parsing asynchronous even for in-memory bodies. Code that previously received a synchronous `Response` from `gateway.fetch()` must await the result:

```ts
const response = await gateway.fetch('http://localhost/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: '{ hello }' }),
});
const result = await response.json();
```

To retain synchronous execution for in-memory requests, disable the limit:

```ts
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';

const gateway = createGatewayRuntime({
  supergraph,
  maxRequestBodySize: false,
});
```

Disabling the gateway's limit alone is not enough if an upstream server still performs asynchronous body parsing. Disabling all such limits removes this particular asynchronous step; it does not guarantee synchronous execution if resolvers, plugins, network requests, or other processing are asynchronous.

Only disable the limit if an appropriate request-body limit is enforced elsewhere.
