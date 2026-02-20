import {
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
  Kind,
  parse,
  typeFromAST,
  type DocumentNode,
  type GraphQLInputObjectType,
  type GraphQLObjectType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type GraphQLType,
  type SelectionSetNode,
} from 'graphql';
import { buildSchemaObjectFromType, resolveFieldType } from 'sofa-api';

export { resolveFieldType, buildSchemaObjectFromType };

/**
 * SOFA's resolveFieldType doesn't handle InputObjectType (it uses $ref for ObjectType in its OpenAPI pipeline)
 * For mcp tool schemas we need inline expansion of input objects, so we wrap resolveFieldType to handle that case via buildSchemaObjectFromType.
 */
function graphqlTypeToJsonSchema(
  type: GraphQLType,
  opts: { customScalars: Record<string, any> },
): any {
  const unwrapped = isNonNullType(type) ? type.ofType : type;
  if (isInputObjectType(unwrapped)) {
    return buildSchemaObjectFromType(unwrapped as GraphQLInputObjectType, opts);
  }
  return resolveFieldType(type, opts);
}

export interface JsonSchema {
  type?: string;
  format?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: string[];
  description?: string;
  $ref?: string;
  oneOf?: JsonSchema[];
}

export function operationToInputSchema(
  operationSource: string,
  schema: GraphQLSchema,
): JsonSchema {
  const document = parse(operationSource);
  const operationDef = document.definitions.find(
    (def) => def.kind === Kind.OPERATION_DEFINITION,
  );

  if (!operationDef || operationDef.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('No operation definition found in document');
  }

  const variables = operationDef.variableDefinitions || [];
  const properties: Record<string, JsonSchema> = {};
  const required = [];

  for (const variable of variables) {
    const varName = variable.variable.name.value;
    const varType = typeFromAST(schema, variable.type);

    if (!varType) {
      throw new Error(`Unknown type for variable $${varName}`);
    }

    if (variable.type.kind === Kind.NON_NULL_TYPE) {
      required.push(varName);
    }

    properties[varName] = graphqlTypeToJsonSchema(varType, {
      customScalars: {},
    });
  }

  // Look up field arguments for descriptions
  if (operationDef.selectionSet) {
    const rootSelection = operationDef.selectionSet.selections[0];
    if (rootSelection && rootSelection.kind === Kind.FIELD) {
      const rootType =
        operationDef.operation === 'query'
          ? schema.getQueryType()
          : schema.getMutationType();
      if (rootType) {
        const field = rootType.getFields()[rootSelection.name.value];
        if (field) {
          for (const arg of field.args) {
            const prop = properties[arg.name];
            if (prop && arg.description) {
              prop.description = arg.description;
            }
          }
        }
      }
    }
  }

  const result: JsonSchema = {
    type: 'object',
    properties,
  };
  if (required.length > 0) {
    result.required = required;
  }
  return result;
}

// extract the tool-level description from the root field's schema description
export function getToolDescriptionFromSchema(
  operationSource: string,
  schema: GraphQLSchema,
): string | undefined {
  const document = parse(operationSource);
  const operationDef = document.definitions.find(
    (def) => def.kind === Kind.OPERATION_DEFINITION,
  );

  if (!operationDef || operationDef.kind !== Kind.OPERATION_DEFINITION) return undefined;

  const rootSelection = operationDef.selectionSet.selections[0];
  if (!rootSelection || rootSelection.kind !== Kind.FIELD) return undefined;

  const rootType =
    operationDef.operation === 'query'
      ? schema.getQueryType()
      : schema.getMutationType();
  if (!rootType) return undefined;

  const field = rootType.getFields()[rootSelection.name.value];
  return field?.description || undefined;
}

// Generate a JSON Schema describing the output shape of a GraphQL operation,
// walks the selection set against the schema to determine types
export function selectionSetToOutputSchema(
  document: DocumentNode,
  schema: GraphQLSchema,
): JsonSchema {
  const operationDef = document.definitions.find(
    (def) => def.kind === Kind.OPERATION_DEFINITION,
  );

  if (!operationDef || operationDef.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('No operation definition found in document');
  }

  const rootType =
    operationDef.operation === 'query'
      ? schema.getQueryType()
      : schema.getMutationType();

  if (!rootType) {
    throw new Error(`Schema has no ${operationDef.operation} type`);
  }

  // An operation's selection set is on the root type (Query/Mutation) 
  // but we want the output schema of the first (root) field's selection
  const rootSelection = operationDef.selectionSet.selections[0];
  if (!rootSelection || rootSelection.kind !== Kind.FIELD) {
    throw new Error('Expected field selection at operation root');
  }

  const rootField = rootType.getFields()[rootSelection.name.value];
  if (!rootField) {
    throw new Error(
      `Field ${rootSelection.name.value} not found on ${rootType.name}`,
    );
  }

  return outputTypeToSchema(rootField.type, rootSelection.selectionSet, schema);
}

function outputTypeToSchema(
  type: GraphQLOutputType,
  selectionSet: SelectionSetNode | undefined,
  schema: GraphQLSchema,
): JsonSchema {
  if (isNonNullType(type)) {
    return outputTypeToSchema(type.ofType, selectionSet, schema);
  }

  if (isListType(type)) {
    return {
      type: 'array',
      items: outputTypeToSchema(type.ofType, selectionSet, schema),
    };
  }

  if (isObjectType(type) && selectionSet) {
    const properties: Record<string, JsonSchema> = {};

    for (const selection of selectionSet.selections) {
      if (selection.kind !== Kind.FIELD) continue;

      const fieldName = selection.name.value;
      if (fieldName === '__typename') continue;

      const field = (type as GraphQLObjectType).getFields()[fieldName];
      if (!field) continue;

      const fieldSchema = outputTypeToSchema(
        field.type,
        selection.selectionSet,
        schema,
      );
      if (field.description) {
        fieldSchema.description = field.description;
      }
      properties[fieldName] = fieldSchema;
    }

    return { type: 'object', properties };
  }

  return resolveFieldType(type, { customScalars: {} });
}
