---
'@graphql-tools/delegate': patch
---

Fix `@stream` directive not working for federated subgraphs with non-null scalar list return types.

Two bugs were addressed in `delegateRequest`:

1. `isListType` was called without first unwrapping `NonNull`, so a field typed `[String!]!` (a `NonNull(List(...))`) was not recognised as a list. The fix wraps the check with `getNullableType()`.

2. Deduplication of already-pushed stream items used a `WeakSet`, which throws a `TypeError` for primitive values (strings, numbers, etc.). This was replaced with an integer index counter that works for both object and primitive list items.
