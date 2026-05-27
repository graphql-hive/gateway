import { parse, type DocumentNode } from 'graphql';

/**
 * Static SDL fragment defining the semantic-introspection types added to a
 * host schema. Matches HotChocolate's `SemanticIntrospectionSchema.cs`
 * verbatim so the wire shape is interoperable.
 */
export const SEMANTIC_INTROSPECTION_TYPES_SDL = /* GraphQL */ `
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
`;

/**
 * Field definitions for the semantic-introspection Query extensions.
 * Combined with the host schema's actual query type name in
 * {@link buildSchemaExtensionDocument} — the query type does not have to be
 * literally named `Query`.
 */
export const SEMANTIC_INTROSPECTION_QUERY_FIELDS_SDL = /* GraphQL */ `
  __search(
    query: String!
    first: Int! = 10
    after: String
    minScore: Float
  ): [__SearchResult!]!
  __definitions(coordinates: [String!]!): [__SchemaDefinition!]!
`;

/**
 * Build the SDL extension document tailored to a specific host schema's
 * query type name.
 */
export function buildSchemaExtensionDocument(
  queryTypeName: string,
): DocumentNode {
  return parse(`
    ${SEMANTIC_INTROSPECTION_TYPES_SDL}

    extend type ${queryTypeName} {
      ${SEMANTIC_INTROSPECTION_QUERY_FIELDS_SDL}
    }
  `);
}
