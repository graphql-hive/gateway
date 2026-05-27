import {
  extendSchema,
  type GraphQLObjectType,
  type GraphQLSchema,
} from 'graphql';
import type { SchemaSearchProvider } from './provider.js';
import { buildSchemaExtensionDocument } from './schema-document.js';

export interface ApplySemanticIntrospectionOptions {
  /**
   * Schema search provider used to satisfy `__search` and (indirectly)
   * `__definitions`. If omitted, a default BM25-based provider is used
   * (added by P3.4).
   */
  provider?: SchemaSearchProvider;

  /**
   * Exclude `@deprecated` fields, enum values, and input fields from the
   * agent-facing surface (`__search` and `__definitions`). The underlying
   * schema is unaffected — standard `__schema` and `__type` introspection
   * continue to return the complete schema.
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
 * Stub resolvers return empty results until P3.3 wires them to a real
 * {@link SchemaSearchProvider}.
 *
 * @throws if the input schema has no query type.
 */
export function applySemanticIntrospection(
  schema: GraphQLSchema,
  // Underscore-prefixed until P3.3 consumes options for real provider wiring.
  _options: ApplySemanticIntrospectionOptions = {},
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

  attachStubResolvers(extended, queryType.name);

  return extended;
}

/**
 * Attach placeholder resolvers to the new Query fields. Returns empty
 * arrays until P3.3 wires the real {@link SchemaSearchProvider}.
 */
function attachStubResolvers(
  schema: GraphQLSchema,
  queryTypeName: string,
): void {
  const queryType = schema.getType(queryTypeName) as GraphQLObjectType;
  const fields = queryType.getFields();

  const searchField = fields['__search'];
  const definitionsField = fields['__definitions'];

  if (searchField) {
    searchField.resolve = async () => [];
  }
  if (definitionsField) {
    definitionsField.resolve = async () => [];
  }
}
