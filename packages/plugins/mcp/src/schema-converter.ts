import {
  type GraphQLSchema,
  type GraphQLType,
  parse,
  Kind,
  typeFromAST,
  isNonNullType,
  isInputObjectType,
  type GraphQLInputObjectType,
} from 'graphql'
import { resolveFieldType, buildSchemaObjectFromType } from 'sofa-api'

export { resolveFieldType, buildSchemaObjectFromType }

/**
 * SOFA's resolveFieldType doesn't handle InputObjectType (it uses $ref for ObjectType in its OpenAPI pipeline)
 * For mcp tool schemas we need inline expansion of input objects, so we wrap resolveFieldType to handle that case via buildSchemaObjectFromType.
 */
function graphqlTypeToJsonSchema(type: GraphQLType, opts: { customScalars: Record<string, any> }): any {
  const unwrapped = isNonNullType(type) ? type.ofType : type
  if (isInputObjectType(unwrapped)) {
    return buildSchemaObjectFromType(unwrapped as GraphQLInputObjectType, opts)
  }
  return resolveFieldType(type, opts)
}

export interface JsonSchema {
  type?: string
  format?: string
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: string[]
  description?: string
  $ref?: string
  oneOf?: JsonSchema[]
}

export function operationToInputSchema(
  operationSource: string,
  schema: GraphQLSchema
): JsonSchema {
  const document = parse(operationSource)
  const operationDef = document.definitions.find(
    def => def.kind === Kind.OPERATION_DEFINITION
  )

  if (!operationDef || operationDef.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('No operation definition found in document')
  }

  const variables = operationDef.variableDefinitions || []
  const properties: Record<string, JsonSchema> = {}
  const required = []

  for (const variable of variables) {
    const varName = variable.variable.name.value
    const varType = typeFromAST(schema, variable.type)

    if (!varType) {
      throw new Error(`Unknown type for variable $${varName}`)
    }

    // Check if required (NonNull in AST)
    if (variable.type.kind === Kind.NON_NULL_TYPE) {
      required.push(varName)
    }

    properties[varName] = graphqlTypeToJsonSchema(varType, { customScalars: {} })
  }

  const result: JsonSchema = {
    type: 'object',
    properties
  }
  if (required.length > 0) {
    result.required = required
  }
  return result
}
