---
'@graphql-tools/federation': major
---

BREAKING CHANGES;

- Removed `buildSubgraphSchema`, use `@apollo/subgraph` instead.
- Removed the following gateway related functions, and prefer using Supergraph approach instead
    - `getSubschemaForFederationWithURL`
    - `getSubschemaForFederationWithTypeDefs`
    - `getSubschemaForFederationWithExecutor`
    - `getSubschemaForFederationWithSchema`
    - `federationSubschemaTransformer`
- `SupergraphSchemaManager` is no longer an `EventEmitter` but `EventTarget` instead, and it emits a real `Event` object.
- `SupergraphSchemaManager` is now `Disposable` and it no longer stops based on Nodejs terminate events, so you should use `using` syntax.

```ts
using manager = new SupergraphSchemaManager({ ... });

manager.addEventListener('error', (event: SupergraphSchemaManagerErrorEvent) => {
  console.error(event.detail.error);
});

let schema: GraphQLSchema | null = null;
manager.addEventListener('schema', (event: SupergraphSchemaManagerSchemaEvent) => {
    schema = event.detail.schema;
});
```