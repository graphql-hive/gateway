---
'@graphql-tools/executor-graphql-ws': major
---

Executor options don't exist graphql-ws dependency options

Removing the dependency on the types. Some options are still exposed, but if you want to further customise the graphql-ws client, you should pass your own instance of the client instead.

```ts
import { buildGraphQLWSExecutor } from '@graphql-tools/executor-graphql-ws';
import { createClient } from 'graphql-ws';
import { options } from './my-graphql-ws-client-options';

const executor = buildGraphQLWSExecutor(
  createClient({
    url: 'ws://localhost:4000/graphql',
    ...options,
  }),
);
```
