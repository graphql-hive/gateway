# @graphql-hive/semantic-introspection

A TypeScript implementation of [GraphQL Semantic Introspection](https://github.com/graphql/ai-wg/blob/main/rfcs/semantic-introspection.md) — `__search` and `__definitions` fields you can add to any `GraphQLSchema` so AI agents can discover capabilities by intent and fetch precise schema slices, without paying the token cost of full introspection.

## Reference implementation

This package is a faithful TypeScript port of the [HotChocolate reference implementation](https://chillicream.com/blog/2026/04/22/semantic-introspection/) by [Pascal Senn](https://github.com/PascalSenn) and the [ChilliCream](https://chillicream.com/) team, originally released for .NET. Default ranker (BM25), indexing recipe, schema additions, and result types match the .NET version. Both projects are MIT-licensed.

## Install

```bash
npm install @graphql-hive/semantic-introspection graphql
```

`graphql` is a peer dependency (`^15.9.0 || ^16.9.0`).

## Quick start

```ts
import { applySemanticIntrospection } from '@graphql-hive/semantic-introspection';
import { buildSchema, graphql } from 'graphql';

const schema = buildSchema(/* GraphQL */ `
  type Query {
    "Find a user by email"
    userByEmail(email: String!): User
  }
  type User {
    id: ID!
    email: String!
  }
`);

// Returns a new schema; the input is not mutated.
const extended = applySemanticIntrospection(schema);

const result = await graphql({
  schema: extended,
  source: /* GraphQL */ `
    {
      __search(query: "user email", first: 5) {
        coordinate
        score
        pathsToRoot
      }
    }
  `,
});
```

## What gets added to the schema

```graphql
type __SearchResult {
  cursor: String!
  coordinate: String!
  definition: __SchemaDefinition!
  pathsToRoot: [[String!]!]!
  score: Float
}

union __SchemaDefinition =
  | __Type
  | __Field
  | __InputValue
  | __EnumValue
  | __Directive

extend type Query {
  __search(
    query: String!
    first: Int! = 10
    after: String
    minScore: Float
  ): [__SearchResult!]!
  __definitions(coordinates: [String!]!): [__SchemaDefinition!]!
}
```

The host query type does not have to be literally named `Query` — the extension is applied against whichever type the schema declares as its query root.

## Options

```ts
applySemanticIntrospection(schema, {
  /**
   * Custom search provider. Defaults to `new Bm25SearchProvider(schema, ...)`.
   */
  provider?: SchemaSearchProvider,

  /**
   * Filter `@deprecated` fields / enum values / input fields from the
   * agent-facing surface (`__search` and `__definitions`). The underlying
   * schema is untouched — `__schema` / `__type` continue to return the full
   * type system. Default: `false`.
   *
   * Forwarded to the default `Bm25SearchProvider`; if you supply your own
   * `provider`, this flag is ignored (you own your filtering policy).
   */
  excludeDeprecated?: boolean,
})
```

### Deprecated-field handling

When `excludeDeprecated: true`:

- The BM25 indexer skips `@deprecated` fields, enum values, and input fields, so they do not appear in `__search` results.
- `__definitions` omits coordinates whose value is itself a deprecated member.
- `__definitions` omits types that would be empty after filtering (see "Empty-after-filter" below). Returning `__Type` with `fields: []` would violate the GraphQL introspection validity contract — clients consuming the response with `buildClientSchema` reject it.
- A non-deprecated field whose return type or argument type is empty-after-filter remains visible — the agent sees the field with an opaque type, rather than the field disappearing (locked design choice; non-cascading).

This is an additive enhancement on top of the .NET reference, which does not implement the flag. Standard `__schema` / `__type` introspection is **always** unaffected and continues to return the complete underlying schema.

## Pluggable search provider

```ts
import type { SchemaSearchProvider } from '@graphql-hive/semantic-introspection';

const myProvider: SchemaSearchProvider = {
  async search(query, first, after, minScore) {
    /* return ranked results */
  },
  async getPathsToRoot(coordinate) {
    /* return paths */
  },
};

const extended = applySemanticIntrospection(schema, { provider: myProvider });
```

Two methods, mirroring HotChocolate's `ISchemaSearchProvider`:

- `search(query, first, after, minScore)` — returns `{ coordinate, score, cursor }[]` ranked descending by score, sliced by `first`/`after`, filtered by `minScore`.
- `getPathsToRoot(coordinate)` — returns lists of coordinates from a root type to the target, ordered shortest-first.

The default `Bm25SearchProvider` indexes type names, field names on Object / Interface, enum values, and input-object fields, with text = `name + " " + description`. Introspection-namespace types (`__*`) and directives are excluded from the search index (directives remain reachable via direct `__definitions` lookup).

## `detectEmptyAfterFilter` utility

Exported for downstream tools that need to identify which types would be empty under a given filter — for example, a schema-rewriting layer (ACL / governance) that wants to physically prune the SDL.

```ts
import { detectEmptyAfterFilter } from '@graphql-hive/semantic-introspection';

const { emptyTypes, reasons } = detectEmptyAfterFilter(schema, {
  excludeDeprecated: true,
});
// emptyTypes: Set<string>            — type names that are empty under the filter
// reasons:    Map<string, EmptyReason> — why each one is empty
```

Transitive fixed-point: a union is empty when all its members are empty (recursive). Scalars are never empty. Non-cascading: a field with an empty return type is not itself classified as empty.

## License

MIT.
