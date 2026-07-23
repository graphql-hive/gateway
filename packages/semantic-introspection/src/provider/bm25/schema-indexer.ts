import {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isIntrospectionType,
  isObjectType,
  type GraphQLEnumType,
  type GraphQLInputObjectType,
  type GraphQLInterfaceType,
  type GraphQLObjectType,
  type GraphQLSchema,
} from 'graphql';
import type { SchemaCoordinate } from '../../provider.js';
import type { Bm25Document } from './document.js';

export interface SchemaIndexerOptions {
  /** Skip `@deprecated` fields, enum values, and input fields when emitting documents. */
  excludeDeprecated?: boolean;
}

export interface SchemaIndexResult {
  documents: Bm25Document[];
  /** `typeName → coordinates of fields returning this type`; used for path-to-root traversal. */
  reverseMap: Map<string, SchemaCoordinate[]>;
}

/**
 * Walk the schema and produce BM25 documents plus a reverse adjacency
 * map. Indexes types, fields on object/interface types, enum values, and
 * input-object fields, skipping introspection types and directives; the
 * indexed text for each document is `name + " " + description`.
 */
export function indexSchema(
  schema: GraphQLSchema,
  options: SchemaIndexerOptions = {},
): SchemaIndexResult {
  const { excludeDeprecated = false } = options;
  const documents: Bm25Document[] = [];
  const reverseMap = new Map<string, SchemaCoordinate[]>();

  const typeMap = schema.getTypeMap();
  for (const typeName of Object.keys(typeMap)) {
    const type = typeMap[typeName]!;

    // Skip standard introspection types and any introspection-namespace
    // names we ourselves add (e.g. `__SearchResult`, `__SchemaDefinition`).
    if (isIntrospectionType(type) || type.name.startsWith('__')) {
      continue;
    }

    // The type itself is always indexed.
    documents.push({
      coordinate: type.name,
      text: buildText(type.name, type.description),
    });

    if (isObjectType(type) || isInterfaceType(type)) {
      indexComplexTypeFields(type, documents, reverseMap, excludeDeprecated);
    } else if (isEnumType(type)) {
      indexEnumValues(type, documents, excludeDeprecated);
    } else if (isInputObjectType(type)) {
      indexInputObjectFields(type, documents, excludeDeprecated);
    }
  }

  return { documents, reverseMap };
}

function indexComplexTypeFields(
  complexType: GraphQLObjectType | GraphQLInterfaceType,
  documents: Bm25Document[],
  reverseMap: Map<string, SchemaCoordinate[]>,
  excludeDeprecated: boolean,
): void {
  const fields = complexType.getFields();
  for (const fieldName of Object.keys(fields)) {
    const field = fields[fieldName]!;

    // Skip introspection-namespace fields (e.g. `__search`, `__definitions`
    // added by applySemanticIntrospection itself).
    if (fieldName.startsWith('__')) {
      continue;
    }

    if (excludeDeprecated && typeof field.deprecationReason === 'string') {
      continue;
    }

    const coordinate: SchemaCoordinate = `${complexType.name}.${fieldName}`;
    documents.push({
      coordinate,
      text: buildText(fieldName, field.description),
    });

    // Reverse adjacency: the field's named return type points back to here.
    const returnTypeName = getNamedType(field.type).name;
    let refs = reverseMap.get(returnTypeName);
    if (!refs) {
      refs = [];
      reverseMap.set(returnTypeName, refs);
    }
    refs.push(coordinate);
  }
}

function indexEnumValues(
  enumType: GraphQLEnumType,
  documents: Bm25Document[],
  excludeDeprecated: boolean,
): void {
  for (const value of enumType.getValues()) {
    if (excludeDeprecated && typeof value.deprecationReason === 'string') {
      continue;
    }
    documents.push({
      coordinate: `${enumType.name}.${value.name}`,
      text: buildText(value.name, value.description),
    });
  }
}

function indexInputObjectFields(
  inputType: GraphQLInputObjectType,
  documents: Bm25Document[],
  excludeDeprecated: boolean,
): void {
  const fields = inputType.getFields();
  for (const fieldName of Object.keys(fields)) {
    const field = fields[fieldName]!;
    if (excludeDeprecated && typeof field.deprecationReason === 'string') {
      continue;
    }
    documents.push({
      coordinate: `${inputType.name}.${fieldName}`,
      text: buildText(fieldName, field.description),
    });
  }
}

function buildText(
  name: string,
  description: string | null | undefined,
): string {
  if (!description) {
    return name;
  }
  return `${name} ${description}`;
}
