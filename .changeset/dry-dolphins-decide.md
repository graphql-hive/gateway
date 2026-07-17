---
'@graphql-tools/delegate': minor
---

Introduce `resolveMergedTypeReference`, a helper that resolves plain objects returned by local resolvers through type merging

When a resolver returns an object containing only the key fields of a merged type, the helper delegates just the missing requested fields to the owning subschema and returns a regular external object, so nested fields keep merging as usual. Fields the object already carries are never fetched again, and objects that already satisfy the request (or satisfy no merge key) are returned untouched.

```ts
// local resolver returns only the key
const payload = { id: '1' };

// client asks for { name surname } -> only `name` and `surname` are
// delegated to the subschema owning `Person`, `id` is kept as-is
resolveMergedTypeReference(payload, context, info);
```
