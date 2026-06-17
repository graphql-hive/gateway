---
"@graphql-tools/delegate": patch
"@graphql-tools/stitch": patch
"@graphql-tools/federation": patch
---

Fix `@provides` so the gateway only requests the provided fields the client actually selected, and stops delegating to the owner subgraph when `@provides` already covers the request.

Previously, when a subgraph declared `@provides(fields: "...")` on a field, the gateway would still:

1. Forward **every** field listed in `@provides` to that subgraph, even when the client never asked for them.
2. After receiving the response, plan additional delegations to the owner subgraph for `@provides`-covered fields whenever the providing subgraph declared them as `@external`, even though the data was already returned.

For example with:

```graphql
# subgraph B (provider)
type Query {
  entity: Entity @provides(fields: "name description")
}

type Entity @key(fields: "id") {
  id: ID!
  name: String! @external
  description: String! @external
}
```

a client query of `{ entity { id name } }` would still cause the gateway to ask subgraph B for `description` *and* fetch `name` again from subgraph A (the owner of `Entity`).

After this fix:

- Only the `@provides` fields the client actually selected are forwarded to the providing subgraph (request side).
- The delegation planner now recognises `@provides` declarations at every nested level (e.g. `@provides(fields: "nested { nestedNested { name description } }")`) and `@provides` declarations made via inline fragments on union/interface members (e.g. `@provides(fields: "... on Book { title }")`), so the gateway no longer round-trips to the owner subgraph for fields that the providing subgraph has already returned.
- Fragment spreads in the client query are correctly handled when selecting `@provides`-covered fields. Previously, using a fragment spread (e.g. `...MyFrag`) to select nested `@external` fields would cause a parse error or an unnecessary delegation to the owner subgraph because the fragment body was stripped to empty by the subgraph schema filter. The gateway now inlines the provided fields directly and removes the dangling spread before forwarding the request.

Aliases, fragments, fragment spreads, `@include`/`@skip` directives wrapping a `@provides` field, and nested `@provides` selections are preserved.
