---
'@graphql-hive/semantic-introspection': minor
---

Initial release of `@graphql-hive/semantic-introspection`.

TypeScript port of HotChocolate's Semantic Introspection — adds `__search` and `__definitions` fields to a GraphQL schema so AI agents can discover capabilities by intent and fetch precise schema slices, without paying the token cost of full introspection.

- `applySemanticIntrospection(schema, opts)` — non-invasive schema extension; the returned schema is a new instance and the input is not mutated.
- Default `Bm25SearchProvider` (BM25 over `name + " " + description`, matching the .NET reference) — pluggable via the `SchemaSearchProvider` interface (`search` + `getPathsToRoot`).
- Opt-in `excludeDeprecated` flag filters `@deprecated` content from the agent-facing surface; standard `__schema` / `__type` introspection remains unchanged.
- `detectEmptyAfterFilter` exported as a public utility — transitive fixed-point classifier across all Kinds (Object / Input / Enum / Union / Interface) for downstream tools that physically rewrite SDL.

Reference implementation: <https://chillicream.com/blog/2026/04/22/semantic-introspection/>. RFC: <https://github.com/graphql/ai-wg/blob/main/rfcs/semantic-introspection.md>.
