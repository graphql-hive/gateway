import {
  type GraphQLType,
  type GraphQLSchema,
  isScalarType,
  isNonNullType,
  isListType,
  isEnumType,
  isInputObjectType,
  parse,
  Kind,
  typeFromAST,
} from 'graphql'

export interface JsonSchema {
  type?: string
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: string[]
  description?: string
}

const SCALAR_MAP: Record<string, string> = {
  String: 'string',
  Int: 'integer',
  Float: 'number',
  Boolean: 'boolean',
  ID: 'string'
}

/*
  Input: GraphQL type like `String!`, `[Int]`, `UserInput`
  Output: JSON Schema object

  graphqlTypeToJsonSchema(StringType, schema)     // { type: "string" }
  graphqlTypeToJsonSchema(IntType, schema)        // { type: "integer" }
  graphqlTypeToJsonSchema(ListOfInt, schema)      // { type: "array", items: { type: "integer" } }
  graphqlTypeToJsonSchema(UserInputType, schema)  // { type: "object", properties: {...}, required: [...] }
  graphqlTypeToJsonSchema(StatusEnum, schema)     // { enum: ["ACTIVE", "INACTIVE"] }
*/
export function graphqlTypeToJsonSchema(
  type: GraphQLType,
  schema: GraphQLSchema
): JsonSchema {
  // Handle NonNull wrapper, unwrap and process inner type
  if (isNonNullType(type)) {
    return graphqlTypeToJsonSchema(type.ofType, schema)
  }

  // Handle List wrapper
  if (isListType(type)) {
    return {
      type: 'array',
      items: graphqlTypeToJsonSchema(type.ofType, schema)
    }
  }

  // Handle enum types
  if (isEnumType(type)) {
    return {
      enum: type.getValues().map(v => v.name)
    }
  }

  // Handle input object types
  if (isInputObjectType(type)) {
    const fields = type.getFields()
    const properties: Record<string, JsonSchema> = {}
    const required: string[] = []

    for (const [fieldName, field] of Object.entries(fields)) {
      // Check if field is required (NonNull)
      if (isNonNullType(field.type)) {
        required.push(fieldName)
      }
      properties[fieldName] = graphqlTypeToJsonSchema(field.type, schema)
      if (field.description) {
        properties[fieldName].description = field.description
      }
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

  // Handle scalar types
  if (isScalarType(type)) {
    const jsonType = SCALAR_MAP[type.name]
    if (jsonType) {
      return { type: jsonType }
    }
    // Unknown scalar, treat as string
    return { type: 'string' }
  }

  // Fallback for unhandled types
  return { type: 'object' }
}
/*
  Input: GraphQL operation string
  const query = `
    query GetUser($id: ID!, $limit: Int, $status: Status) {
      user(id: $id) { name }
    }
  `

  Output: JSON Schema for the variables
  operationToInputSchema(query, schema)
  {
    type: "object",
    properties: {
      id: { type: "string" },
      limit: { type: "integer" },
      status: { enum: ["ACTIVE", "INACTIVE"] }
    },
    required: ["id"]
  }
*/
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

    properties[varName] = graphqlTypeToJsonSchema(varType, schema)
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
