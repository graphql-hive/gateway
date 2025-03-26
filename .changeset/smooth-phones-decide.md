---
'@graphql-hive/gateway-runtime': minor
---

Request ID configuration;

By default, first Hive Gateway was checking if `x-request-id` exists in the HTTP headers, then generates and sets a new one.
And this can be disabled by setting `requestId` to `false` in the `gatewayConfig`.

Now you can configure the request ID generation by providing a function to the `requestId` field in the `gatewayConfig` (or inherit from the framework you use).
And you can also rename the header name by setting the `headerName` field in the `gatewayConfig`.

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
    requestId: {
        headerName: 'x-request-id',
        generateRequestId({ request, context, fetchAPI }) {
            return fetchAPI.crypto.randomUUID();
        }
    }
})
```

This is useful with Fastify because it handles the request ID generation and propagation by itself.
```ts
const requestIdHeader = 'x-guild-request-id';

const app = fastify({
  /** ... */
  requestIdHeader,
  // Align with Hive Gateway's request id log label
  requestIdLogLabel: 'requestId',
  genReqId(req) {
    if (req.headers[requestIdHeader]) {
      return req.headers[requestIdHeader].toString();
    }
    return crypto.randomUUID();
  },
});

const gateway = createGateway({
    /** ... */
    requestId: {
      headerName: requestIdHeader,
      generateRequestId({ request, context, fetchAPI }) {
        return request.id;
      }
    }
});
``` 
