# @graphql-hive/semantic-introspection

> **Status:** in development. Public API stabilizes with the initial release PR.

A TypeScript implementation of [GraphQL Semantic Introspection](https://github.com/graphql/ai-wg/blob/main/rfcs/semantic-introspection.md) — `__search` and `__definitions` fields you can add to any `GraphQLSchema` so AI agents can discover capabilities by intent and fetch precise schema slices, without paying the token cost of full introspection.

## Reference implementation

This package is a faithful TypeScript port of the [HotChocolate reference implementation](https://chillicream.com/blog/2026/04/22/semantic-introspection/) by [Pascal Senn](https://github.com/PascalSenn) and the [ChilliCream](https://chillicream.com/) team, originally released for .NET. Default ranker (BM25), indexing recipe, schema additions, and result types match the .NET version. Both projects are MIT-licensed.

## Install

    npm install @graphql-hive/semantic-introspection graphql

`graphql` is a peer dependency.

## Usage

Usage stabilizes with the initial release PR.

## License

MIT
