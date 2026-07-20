---
'@graphql-tools/delegate': minor
---

Introduce `resolveMergedTypeReference`, a helper that resolves plain objects returned by local resolvers through type merging

When a resolver returns an object containing only the key fields of a merged type, the helper delegates just the missing requested fields through the stitching planner. Standard type merging remains enabled, so computed fields, `@requires` dependencies, batching, and fields owned by other subschemas are resolved by stitching as usual. Fields the object already carries are never fetched again, and objects that already satisfy the request (or satisfy no merge key) are returned untouched.

```ts
// local resolver returns only the key
const payload = { id: '1' };

// client asks for { name surname } -> stitching resolves the missing fields
// across the relevant subschemas while `id` is kept as-is
resolveMergedTypeReference(payload, context, info);
```
