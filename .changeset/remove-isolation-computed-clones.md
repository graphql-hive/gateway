---
'@graphql-tools/stitch': major
'@graphql-tools/delegate': minor
---

**Breaking:** Remove `isolateComputedFieldsTransformer` and isolation-clone planning.

### What changed

Computed / `@requires` fields used to live on **cloned** subschema copies so the initial Query hop could not select them early. That N-clone tax is gone. Computed fields stay on the single subschema schema; `deferComputedFieldsTransformer` strips them from non-merge outbound requests and injects merge-key fields (including nested selections) so later entity hops still have identity. Aliased key fields (for example `aliasId: id`) are not treated as the literal merge key.

Default `stitchSchemas` / federation presets already include deferral. Most apps need no config change.

### Migration

If you previously passed isolation explicitly, drop it:

```ts
// before
import {
  isolateComputedFieldsTransformer,
  stitchSchemas,
} from '@graphql-tools/stitch';

stitchSchemas({
  subschemas,
  subschemaConfigTransforms: [isolateComputedFieldsTransformer],
});

// after
import { stitchSchemas } from '@graphql-tools/stitch';

stitchSchemas({ subschemas });
// defaults already defer computed fields without cloning
```

Computed field config is unchanged. Example inventory-style merge:

```ts
merge: {
  Product: {
    selectionSet: '{ upc }',
    fieldName: 'products',
    key: ({ upc }) => upc,
    argsFromKeys: (upcs) => ({ upcs }),
    fields: {
      shippingEstimate: {
        selectionSet: '{ price weight }',
        computed: true,
      },
    },
  },
}
```

`shippingEstimate` stays on the schema for merge hops, but the initial `products` selection no longer resolves it before `price` / `weight` are available.
