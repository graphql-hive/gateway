import {
  extendSchema,
  Kind,
  type DocumentNode,
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
  /** Search provider for `__search` (and indirectly `__definitions`). Defaults to a {@link Bm25SearchProvider} over the extended schema. */
  provider?: SchemaSearchProvider;
  /** Exclude `@deprecated` fields, enum values, and input fields from `__search` and `__definitions`. Standard introspection is unaffected. */
  excludeDeprecated?: boolean;
}

/**
 * Add `__search` and `__definitions` to a GraphQL schema. Returns a new
 * schema; the input is not mutated. Throws if the input has no query type.
 */
export function applySemanticIntrospection(
  schema: GraphQLSchema,
  options: ApplySemanticIntrospectionOptions = {},
): GraphQLSchema {
  const queryType = schema.getQueryType();
  if (!queryType) {
    throw new Error(
      'applySemanticIntrospection: schema must define a query type',
    );
  }

  const extensionDoc = buildSchemaExtensionDocument(queryType.name);

  // Collision checks — `extendSchema({ assumeValid: true })` below skips
  // validation, so any pre-existing field or type name we'd introduce
  // would silently produce a duplicate-extension schema rather than
  // failing. The type-name list is derived from the extension document
  // so it stays in sync if the SDL grows.
  const existingFields = queryType.getFields();
  if (existingFields['__search'] || existingFields['__definitions']) {
    throw new Error(
      `applySemanticIntrospection: query type "${queryType.name}" already defines \`__search\` or \`__definitions\`; refusing to extend`,
    );
  }
  const typeMap = schema.getTypeMap();
  for (const name of extensionTypeNames(extensionDoc)) {
    if (typeMap[name]) {
      throw new Error(
        `applySemanticIntrospection: schema already defines \`${name}\` as a type; refusing to extend`,
      );
    }
  }

  // `assumeValid` lets graphql-js accept the `__`-prefixed names the RFC adds.
  const extended = extendSchema(schema, extensionDoc, { assumeValid: true });

  const excludeDeprecated = options.excludeDeprecated === true;
  const provider =
    options.provider ?? new Bm25SearchProvider(extended, { excludeDeprecated });
  const { emptyTypes } = detectEmptyAfterFilter(extended, {
    excludeDeprecated,
  });
  const filter: LookupFilter = { excludeDeprecated, emptyTypes };

  attachSearchResolver(extended, queryType.name, provider, filter);
  attachDefinitionsResolver(extended, queryType.name, filter);
  attachSearchResultResolvers(extended, provider, filter);
  attachDefinitionUnionResolveType(extended);

  return extended;
}

/** Names of every named type the extension document defines. */
function extensionTypeNames(doc: DocumentNode): string[] {
  const names: string[] = [];
  for (const def of doc.definitions) {
    if (
      def.kind === Kind.SCALAR_TYPE_DEFINITION ||
      def.kind === Kind.OBJECT_TYPE_DEFINITION ||
      def.kind === Kind.INTERFACE_TYPE_DEFINITION ||
      def.kind === Kind.UNION_TYPE_DEFINITION ||
      def.kind === Kind.ENUM_TYPE_DEFINITION ||
      def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
    ) {
      names.push(def.name.value);
    }
  }
  return names;
}

/**
 * Maximum provider pages fetched per `__search` call when the filter
 * keeps dropping every result. Guards against non-advancing providers
 * and against pathological schemas where huge swaths of indexed
 * coordinates are empty-after-filter.
 */
const SEARCH_MAX_PROVIDER_PAGES = 16;

function attachSearchResolver(
  schema: GraphQLSchema,
  queryTypeName: string,
  provider: SchemaSearchProvider,
  filter: LookupFilter,
): void {
  const queryType = schema.getType(queryTypeName) as GraphQLObjectType;
  const searchField = queryType.getFields()['__search'];
  if (!searchField) return;
  searchField.resolve = async (
    _root: unknown,
    args: {
      query: string;
      first: number;
      after?: string | null;
      minScore?: number | null;
    },
  ) => {
    const target = args.first;
    const minScore = args.minScore ?? null;
    const survivors: SchemaSearchResult[] = [];
    let after = args.after ?? null;

    // Loop until we have `first` survivors or the provider is exhausted.
    // A naive single-page fetch would lose pagination entirely when a
    // whole page is filtered out: the client gets `[]` with no cursor
    // and can't reach later valid hits.
    for (let page = 0; page < SEARCH_MAX_PROVIDER_PAGES; page++) {
      const rawPage = await provider.search(
        args.query,
        target,
        after,
        minScore,
      );
      if (rawPage.length === 0) {
        break;
      }

      for (const r of rawPage) {
        if (filteredLookup(schema, r.coordinate, filter) !== null) {
          survivors.push(r);
          if (survivors.length >= target) {
            break;
          }
        }
      }

      if (survivors.length >= target) {
        break;
      }

      // Whole page kept fewer than `target` survivors; advance past it.
      const lastCursor = rawPage[rawPage.length - 1]!.cursor;
      if (lastCursor === after) {
        // Provider isn't advancing — safety break.
        break;
      }
      after = lastCursor;
    }

    return survivors;
  };
}

function attachDefinitionsResolver(
  schema: GraphQLSchema,
  queryTypeName: string,
  filter: LookupFilter,
): void {
  const queryType = schema.getType(queryTypeName) as GraphQLObjectType;
  const definitionsField = queryType.getFields()['__definitions'];
  if (!definitionsField) return;
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

function attachSearchResultResolvers(
  schema: GraphQLSchema,
  provider: SchemaSearchProvider,
  filter: LookupFilter,
): void {
  const searchResultType = schema.getType('__SearchResult') as
    | GraphQLObjectType
    | undefined;
  if (!searchResultType) return;
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

function attachDefinitionUnionResolveType(schema: GraphQLSchema): void {
  const definitionUnion = schema.getType('__SchemaDefinition') as
    | GraphQLUnionType
    | undefined;
  if (definitionUnion) {
    definitionUnion.resolveType = resolveSchemaDefinitionType;
  }
}
