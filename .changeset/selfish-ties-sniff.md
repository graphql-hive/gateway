---
'@graphql-tools/executor-http': minor
---

Add `exposeHTTPDetailsInExtensions` flag to get `Response` details in the result extensions.

```ts
import { buildHTTPExecutor } from '@graphql-tools/executor-http';

const executor = buildHTTPExecutor({
  exposeHTTPDetailsInExtensions: true,
});
```

Then in the result;

```ts
{
    "data": {
        "hello": "world"
    },
    "extensions": {
        "request": {
            "url": "http://localhost:4000/graphql",
            "method": "POST",
            "headers": {
                "content-type": "application/json"
            },
            "body": "{\"query\":\"{ hello }\"}"
        },
        "response": {
            "status": 200,
            "statusText": "OK",
            "headers": {
                "content-type": "application/json"
            }
        }
    }
}
