import {
  extendSchema,
  type GraphQLObjectType,
  type GraphQLSchema,
  type GraphQLUnionType,
} from 'graphql';
import { detectEmptyAfterFilter } from './detect-empty-after-filter.js';
import type { SchemaSearchProvider, SchemaSearchResult } from './provider.js';
import { Bm25SearchProvider } from './provider/bm25/bm25-search-provider.js';
import {
  filteredLookup,
  resolveSchemaDefinitionType,
  type LookupFilter,
} from './resolvers.js';
import { buildSchemaExtensionDocument } from './schema-document.js';

export interface ApplySemanticIntrospectionOptions {
  /**
   * Schema search provider used to satisfy `__search` and (indirectly)
   * `__definitions`. If omitted, a default {@link Bm25SearchProvider} is
   * constructed over the extended schema.
   */
  provider?: SchemaSearchProvider;

  /**
   * Exclude `@deprecated` fields, enum values, and input fields from the
   * agent-facing surface (`__search` and `__definitions`). The underlying
   * schema is unaffected — standard `__schema` and `__type` introspection
   * continue to return the complete schema.
   *
   * Forwarded to the default {@link Bm25SearchProvider}; if a custom
   * `provider` is supplied, this flag is ignored (the custom provider is
   * responsible for its own filtering policy).
   *
   * Default: `false` (parity with the HotChocolate reference implementation).
   */
  excludeDeprecated?: boolean;
}

/**
 * Add `__search` and `__definitions` semantic-introspection fields to a
 * GraphQL schema. The returned schema is a new instance — the input is
 * not mutated.
 *
 * The `__SearchResult` type and `__SchemaDefinition` union are added to
 * the schema's type system, and the host schema's query type is extended
 * with the two new fields. The query type does not have to be literally
 * named `Query`.
 *
 * @throws if the input schema has no query type.
 */
export function applySemanticIntrospection(
  schema: GraphQLSchema,
  options: ApplySemanticIntrospectionOptions = {},
): GraphQLSchema {
  const queryType = schema.getQueryType();
  if (!queryType) {
    throw new Error(
      '[@graphql-hive/semantic-introspection] schema must define a query type',
    );
  }

  // `assumeValid` bypasses graphql-js's validation that names cannot begin
  // with `__` (reserved for introspection) — by design here, since the
  // semantic-introspection RFC adds new introspection-namespace types.
  const extended = extendSchema(
    schema,
    buildSchemaExtensionDocument(queryType.name),
    { assumeValid: true },
  );

  const excludeDeprecated = options.excludeDeprecated === true;
  const provider =
    options.provider ?? new Bm25SearchProvider(extended, { excludeDeprecated });

  // Precompute the empty-after-filter type set once at apply time. The
  // set is fixed by the schema + filter; resolvers consult it on each
  // __definitions / __SearchResult.definition lookup.
  const { emptyTypes } = detectEmptyAfterFilter(extended, {
    excludeDeprecated,
  });
  const filter: LookupFilter = { excludeDeprecated, emptyTypes };

  attachResolvers(extended, queryType.name, provider, filter);

  return extended;
}

function attachResolvers(
  schema: GraphQLSchema,
  queryTypeName: string,
  provider: SchemaSearchProvider,
  filter: LookupFilter,
): void {
  const queryType = schema.getType(queryTypeName) as GraphQLObjectType;
  const queryFields = queryType.getFields();

  // ── Query.__search ────────────────────────────────────────────────────
  const searchField = queryFields['__search'];
  if (searchField) {
    searchField.resolve = (
      _root: unknown,
      args: {
        query: string;
        first: number;
        after?: string | null;
        minScore?: number | null;
      },
    ) =>
      provider.search(
        args.query,
        args.first,
        args.after ?? null,
        args.minScore ?? null,
      );
  }

  // ── Query.__definitions ───────────────────────────────────────────────
  const definitionsField = queryFields['__definitions'];
  if (definitionsField) {
    definitionsField.resolve = (
      _root: unknown,
      args: { coordinates: readonly string[] },
    ) => {
      const results = [];
      for (const coord of args.coordinates) {
        const def = filteredLookup(schema, coord, filter);
        if (def !== null) {
          results.push(def);
        }
      }
      return results;
    };
  }

  // ── __SearchResult.{definition, pathsToRoot} ──────────────────────────
  const searchResultType = schema.getType('__SearchResult') as
    | GraphQLObjectType
    | undefined;
  if (searchResultType) {
    const fields = searchResultType.getFields();
    const definitionField = fields['definition'];
    if (definitionField) {
      definitionField.resolve = (parent: SchemaSearchResult) =>
        filteredLookup(schema, parent.coordinate, filter);
    }
    const pathsToRootField = fields['pathsToRoot'];
    if (pathsToRootField) {
      pathsToRootField.resolve = (parent: SchemaSearchResult) =>
        provider.getPathsToRoot(parent.coordinate);
    }
  }

  // ── __SchemaDefinition union resolveType ──────────────────────────────
  const definitionUnion = schema.getType('__SchemaDefinition') as
    | GraphQLUnionType
    | undefined;
  if (definitionUnion) {
    definitionUnion.resolveType = resolveSchemaDefinitionType;
  }
}
