---
'@graphql-tools/delegate': patch
---

Gateway-owned `@defer` no longer loses deferred fields that live in the same subgraph as their parent

Since gateway-owned `@defer` became the default, a deferred selection is stripped from the subgraph request and fetched again afterwards through the parent's entity resolver. When that refetch could not happen, the field was lost: a non-null field came back as `Cannot return null for non-nullable field`, and a nullable one as a silent `null`.

- When the parent can be fetched again, its key is now added to the initial subgraph request, so the refetch works even when the client did not select the key.
- When the parent cannot be fetched again (the type has no key, or no resolver for that subgraph), the deferred field stays in the initial subgraph request and is still delivered in the deferred payload.
- `@defer(if: false)`, and `@defer(if: $flag)` with `$flag` false, now behave as if there were no `@defer`: the selections are sent normally and the directive is removed.
