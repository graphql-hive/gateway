import { parse, type DocumentNode } from 'graphql';

/** SDL for the semantic-introspection types added to a host schema. */
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

/** SDL for the query-type extensions; spliced into the host's query type by {@link buildSchemaExtensionDocument}. */
export const SEMANTIC_INTROSPECTION_QUERY_FIELDS_SDL = /* GraphQL */ `
  __search(
    query: String!
    first: Int! = 10
    after: String
    minScore: Float
  ): [__SearchResult!]!
  __definitions(coordinates: [String!]!): [__SchemaDefinition!]!
`;

/** Build the SDL extension document for a host schema's query type. */
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
