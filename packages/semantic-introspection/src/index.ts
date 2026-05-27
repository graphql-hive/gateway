/**
 * @graphql-hive/semantic-introspection
 *
 * TypeScript implementation of GraphQL Semantic Introspection — adds
 * `__search` and `__definitions` fields to a GraphQL schema so AI agents
 * can discover capabilities by intent and fetch precise schema slices,
 * without paying the token cost of full introspection.
 *
 * Faithful port of HotChocolate's reference implementation
 * (ChilliCream/graphql-platform). Default ranker is BM25; alternative
 * providers (e.g. embeddings) can be supplied via the
 * `SchemaSearchProvider` interface.
 *
 * Status: scaffolding. Public surface stabilizes across P3.2 – P3.7.
 *
 * @packageDocumentation
 * @see https://chillicream.com/blog/2026/04/22/semantic-introspection/
 * @see https://github.com/graphql/ai-wg/blob/main/rfcs/semantic-introspection.md
 */

export {};
