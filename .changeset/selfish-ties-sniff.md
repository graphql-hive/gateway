---
'@graphql-tools/executor-http': minor
---

Add `onHTTPResponse` hook to get `Response` returned by `fetch`;

```ts
import { buildHTTPExecutor } from '@graphql-tools/executor-http';

const executor = buildHTTPExecutor({
  onHTTPResponse(response) {
    console.log('Received response with status:', response.status);
  },
});
```
