---
'@graphql-tools/batch-delegate': patch
'@graphql-tools/delegate': patch
---

Fix incorrect error path when delegating a single type to a list type in a subschema.

When using schema stitching with type merging (e.g., a supergraph `book` field delegating to a subschema `books` list field via batch delegation), errors from the subschema now correctly report the path as seen in the supergraph (e.g., `['book', 'title']`) instead of including an unexpected array index (e.g., `['book', 0, 'title']`).

Also ensures `onLocatedError` is passed through in all branches of `getDelegationContext`.
