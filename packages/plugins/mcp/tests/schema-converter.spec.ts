import { describe, it, expect } from 'vitest'
import {
  buildSchema,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull
} from 'graphql'
import { resolveFieldType, buildSchemaObjectFromType, operationToInputSchema } from '../src/schema-converter.js'

const noCustomScalars = { customScalars: {} }

describe('resolveFieldType', () => {
  it('converts String to string', () => {
    expect(resolveFieldType(GraphQLString, noCustomScalars)).toEqual({
      type: 'string'
    })
  })

  it('converts Int to integer', () => {
    expect(resolveFieldType(GraphQLInt, noCustomScalars)).toEqual({
      type: 'integer',
      format: 'int32'
    })
  })

  it('converts Float to number', () => {
    expect(resolveFieldType(GraphQLFloat, noCustomScalars)).toEqual({
      type: 'number',
      format: 'float'
    })
  })

  it('converts Boolean to boolean', () => {
    expect(resolveFieldType(GraphQLBoolean, noCustomScalars)).toEqual({
      type: 'boolean'
    })
  })

  it('converts ID to string', () => {
    expect(resolveFieldType(GraphQLID, noCustomScalars)).toEqual({
      type: 'string'
    })
  })
})

describe('resolveFieldType wrappers', () => {
  it('converts [String] to array of strings', () => {
    const listType = new GraphQLList(GraphQLString)
    expect(resolveFieldType(listType, noCustomScalars)).toEqual({
      type: 'array',
      items: { type: 'string' }
    })
  })

  it('converts String! by unwrapping NonNull', () => {
    const nonNullType = new GraphQLNonNull(GraphQLString)
    expect(resolveFieldType(nonNullType, noCustomScalars)).toEqual({
      type: 'string'
    })
  })

  it('converts [Int!]! to array of integers', () => {
    const complexType = new GraphQLNonNull(
      new GraphQLList(new GraphQLNonNull(GraphQLInt))
    )
    expect(resolveFieldType(complexType, noCustomScalars)).toEqual({
      type: 'array',
      items: { type: 'integer', format: 'int32' }
    })
  })
})

describe('resolveFieldType enums', () => {
  const schema = buildSchema(`
    type Query { test: String }
    enum TemperatureUnit {
      CELSIUS
      FAHRENHEIT
      KELVIN
    }
  `)

  it('converts enum to JSON Schema enum', () => {
    const enumType = schema.getType('TemperatureUnit')!
    expect(resolveFieldType(enumType, noCustomScalars)).toEqual({
      type: 'string',
      enum: ['CELSIUS', 'FAHRENHEIT', 'KELVIN']
    })
  })
})

describe('buildSchemaObjectFromType input objects', () => {
  const schema = buildSchema(`
    type Query { test: String }
    input CreateUserInput {
      email: String!
      name: String
      age: Int
    }
  `)

  it('converts input object to JSON Schema object with properties and required', () => {
    const inputType = schema.getType('CreateUserInput')!
    expect(buildSchemaObjectFromType(inputType as any, noCustomScalars)).toEqual({
      type: 'object',
      properties: {
        email: { type: 'string' },
        name: { type: 'string' },
        age: { type: 'integer', format: 'int32' }
      },
      required: ['email']
    })
  })
})

describe('operationToInputSchema', () => {
  const schema = buildSchema(`
    type Query {
      getWeather(location: String!, units: TemperatureUnit): Weather
    }
    type Weather {
      temperature: Float!
      conditions: String!
    }
    enum TemperatureUnit {
      CELSIUS
      FAHRENHEIT
    }
  `)

  it('extracts variables from operation and converts to JSON Schema', () => {
    const operation = `
      query GetWeather($location: String!, $units: TemperatureUnit) {
        getWeather(location: $location, units: $units) {
          temperature
          conditions
        }
      }
    `
    const result = operationToInputSchema(operation, schema)
    expect(result).toEqual({
      type: 'object',
      properties: {
        location: { type: 'string' },
        units: { type: 'string', enum: ['CELSIUS', 'FAHRENHEIT'] }
      },
      required: ['location']
    })
  })

  it('returns empty schema for operation with no variables', () => {
    const operation = `
      query GetDefaultWeather {
        getWeather(location: "Berlin") {
          temperature
        }
      }
    `
    const result = operationToInputSchema(operation, schema)
    expect(result).toEqual({
      type: 'object',
      properties: {}
    })
  })
})
