---
'@graphql-tools/stitch': minor
'@graphql-tools/delegate': patch
---

Keep multiple merged-type `entryPoints` on **one** subschema instead of cloning a `SubschemaConfig` per entry.

### Before

Two keys on the same subgraph used to become two registered subschemas (via `splitMergedTypeEntryPointsTransformer`). That duplicated stitching bookkeeping and could split work that should be one merge.

### After

Declare every key on the same `merge` config. The planner treats the target as proxiable when **any** entry's keys are present; at hop time stitching picks the entry that matches the parent (including nested keys like `{ organization { id } }`). Parent merge defaults (`argsFromKeys`, `valuesFromResults`, `dataLoaderOptions`, shared `key` / `args` / `fieldName`) overlay onto each entry, and a per-entry custom `resolve` is honored when set.

```ts
stitchSchemas({
  subschemas: [
    {
      schema: vendorSchema,
      merge: {
        Product: {
          // shared batching defaults apply to every entry unless overridden
          argsFromKeys: (keys) => ({ keys }),
          valuesFromResults: (results) => results,
          entryPoints: [
            {
              selectionSet: '{ upc }',
              fieldName: 'productsByKey',
              key: ({ upc }) => ({ upc }),
            },
            {
              selectionSet: '{ id }',
              fieldName: 'productsByKey',
              key: ({ id }) => ({ id }),
            },
          ],
        },
      },
    },
  ],
});
```

With a parent that only has `upc`, the first entry runs; with only `id`, the second. Nested keys work the same way:

```ts
entryPoints: [
  {
    selectionSet: '{ organization { id } }',
    fieldName: 'productByOrg',
    key: ({ organization }) => organization?.id,
    argsFromKeys: (ids) => ({ ids }),
  },
  {
    selectionSet: '{ upc }',
    fieldName: 'productByUpc',
    key: ({ upc }) => upc,
    argsFromKeys: (upcs) => ({ upcs }),
  },
]
```

No caller API change is required if you already used `entryPoints`; clones simply stop happening.
