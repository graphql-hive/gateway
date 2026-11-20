---
'@graphql-mesh/fusion-runtime': major
'@graphql-hive/gateway-runtime': major
'@graphql-tools/stitch': minor
---

**Breaking:** Remove the `onDelegationPlan` and `onDelegationStageExecute` plugin hooks (and the debug plugin that only existed for them). Those hooks blocked delegation-plan memoization and were rarely used.

Delegation-plan memoization is restored with a parent field-presence seed key:

- Types **without** computed / `@requires` field selections ignore parent shape and share one cached plan per `(schema, sourceSubschema, variables, fragments, fieldNodes)` tuple (same as the previous always-on `memoize5of7` path).
- Types **with** `fieldSelectionSets` (computed / `@requires`) still memoize when parents expose the same fields, so list merges reuse plans without breaking clone-less requires.
- Progressive override still skips memoize.

`onDelegate` is unchanged.

### Migration

Delete hook usage from gateway / fusion plugins:

```ts
// before
const gateway = createGatewayRuntime({
  supergraph,
  plugins: [
    {
      onDelegationPlan() {
        /* ... */
      },
      onDelegationStageExecute() {
        /* ... */
      },
    },
  ],
});

// after: remove those hooks
const gateway = createGatewayRuntime({
  supergraph,
  plugins: [
    {
      onDelegate({ typeName, fieldName }) {
        // still supported for per-delegation instrumentation
      },
    },
  ],
});
```

If you relied on plan/stage hooks only for debugging, use existing logging / OpenTelemetry plugins instead. No stitchSchemas merge-config change is required for the memoize restore.
