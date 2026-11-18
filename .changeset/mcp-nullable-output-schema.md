---
'@graphql-hive/plugin-mcp': patch
---

Allow `null` in the generated tool `outputSchema` for nullable GraphQL fields

**Behaviour change:** the `outputSchema` published in `tools/list` previously ignored nullability, so `T` and `T!` produced the same schema. GraphQL returns an explicit `null` for nullable fields, which violated that schema and made MCP hosts that validate `structuredContent` (such as Claude Desktop) reject the tool result.

Nullable fields now allow `null` (e.g. `{ "type": ["string", "null"] }`, with `null` added to `enum` for nullable enums, or `anyOf` with `{ "type": "null" }` for types without a single `type` such as unions). `NonNull` fields stay strict and the root schema is still a plain `object`. Clients that inspect `outputSchema` programmatically will now see `type` as an array for nullable fields.
