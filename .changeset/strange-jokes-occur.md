---
'@graphql-tools/delegate': patch
---

`defaultMergedResolver` now falls back to the literal field name when an external object does not have the requested response key

Plain resolver data merged into an external object is keyed by field name, so an aliased request used to resolve to `null` even though the value was there:

```graphql
{
  person {
    fullName: name
  }
}
```

```ts
// merged object carries resolver data by field name
{ id: '1', name: 'Local' }
```

Previously `fullName` was `null` because only the alias was looked up. Now it resolves to `'Local'` by field name, matching plain graphql-js behavior. When the response key is present (e.g. the field came from a subschema), it is still preferred.
