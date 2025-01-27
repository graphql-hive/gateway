---
'@graphql-tools/federation': minor
---

Now `SupergraphSchemaManager` can be used in `ApolloServer` as `gateway`;

```ts
import { SupergraphSchemaManager } from '@graphql-tools/federation';
import { ApolloServer } from '@apollo/server';

const gateway = new SupergraphSchemaManager();
const apolloServer = new ApolloServer({
  gateway,
});
```

And with the new `onStitchedSchema` option, you can manipulate the executable schema created from the supergraph.
The following example demonstrates how to use `onStitchedSchema` with `applyMiddleware` from `graphql-middleware`:

```ts
import { SupergraphSchemaManager } from '@graphql-tools/federation';
import { applyMiddleware } from 'graphql-middleware';

const logInput = async (resolve, root, args, context, info) => {
  console.log(`1. logInput: ${JSON.stringify(args)}`)
  const result = await resolve(root, args, context, info)
  console.log(`5. logInput`)
  return result
}

const logResult = async (resolve, root, args, context, info) => {
  console.log(`2. logResult`)
  const result = await resolve(root, args, context, info)
  console.log(`4. logResult: ${JSON.stringify(result)}`)
  return result
}

const gateway = new SupergraphSchemaManager({
  onStitchedSchema: async (schema) => {
    // Manipulate the schema
    return applyMiddleware(schema, logInput, logResult);
  },
});
```
