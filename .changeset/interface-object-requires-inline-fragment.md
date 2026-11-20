---
'@graphql-tools/stitch': patch
---

Fetch `@requires` fields of an `@interfaceObject` field when it is selected through an inline fragment on an implementation

For example, `location { ... on Store { events } }` where `events` is `@requires(fields: "code")` on the `Location` interface object now sends `code` to the contributing subgraph.
