---
"@graphql-tools/delegate": patch
---

Fix `@provides` so the gateway only requests the provided fields the client actually selected.

Previously, when a subgraph declared `@provides(fields: "...")` on a query field, the gateway would forward **every** field listed in the `@provides` argument to that subgraph, even when the client never asked for those fields. For example with:

```graphql
# subgraph B
type Query {
  entity: Entity @provides(fields: "name description")
}

type Entity @key(fields: "id") {
  id: ID!
  name: String! @external
  description: String! @external
}
```

a client query of `{ entity { id name } }` would still cause the gateway to ask subgraph B for `description`. After this fix the gateway only forwards `name` (because that is what the client asked for and what `@provides` allows the subgraph to resolve directly), bringing the behavior in line with Federation's `@provides` semantics where it acts as a hint that the providing subgraph **can** resolve those fields locally — not a directive to always fetch them.

Aliases, fragments, fragment spreads, and nested `@provides` selections are preserved.
