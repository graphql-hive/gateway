import {
  buildSchema,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLString,
  parse,
} from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  buildSchemaObjectFromType,
  getToolDescriptionFromSchema,
  operationToInputSchema,
  resolveFieldType,
  selectionSetToOutputSchema,
} from '../src/schema-converter.js';

const noCustomScalars = { customScalars: {} };

describe('resolveFieldType', () => {
  it('converts String to string', () => {
    expect(resolveFieldType(GraphQLString, noCustomScalars)).toEqual({
      type: 'string',
    });
  });

  it('converts Int to integer', () => {
    expect(resolveFieldType(GraphQLInt, noCustomScalars)).toEqual({
      type: 'integer',
      format: 'int32',
    });
  });

  it('converts Float to number', () => {
    expect(resolveFieldType(GraphQLFloat, noCustomScalars)).toEqual({
      type: 'number',
      format: 'float',
    });
  });

  it('converts Boolean to boolean', () => {
    expect(resolveFieldType(GraphQLBoolean, noCustomScalars)).toEqual({
      type: 'boolean',
    });
  });

  it('converts ID to string', () => {
    expect(resolveFieldType(GraphQLID, noCustomScalars)).toEqual({
      type: 'string',
    });
  });
});

describe('resolveFieldType wrappers', () => {
  it('converts [String] to array of strings', () => {
    const listType = new GraphQLList(GraphQLString);
    expect(resolveFieldType(listType, noCustomScalars)).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('converts String! by unwrapping NonNull', () => {
    const nonNullType = new GraphQLNonNull(GraphQLString);
    expect(resolveFieldType(nonNullType, noCustomScalars)).toEqual({
      type: 'string',
    });
  });

  it('converts [Int!]! to array of integers', () => {
    const complexType = new GraphQLNonNull(
      new GraphQLList(new GraphQLNonNull(GraphQLInt)),
    );
    expect(resolveFieldType(complexType, noCustomScalars)).toEqual({
      type: 'array',
      items: { type: 'integer', format: 'int32' },
    });
  });
});

describe('resolveFieldType enums', () => {
  const schema = buildSchema(`
    type Query { test: String }
    enum TemperatureUnit {
      CELSIUS
      FAHRENHEIT
      KELVIN
    }
  `);

  it('converts enum to JSON Schema enum', () => {
    const enumType = schema.getType('TemperatureUnit')!;
    expect(resolveFieldType(enumType, noCustomScalars)).toEqual({
      type: 'string',
      enum: ['CELSIUS', 'FAHRENHEIT', 'KELVIN'],
    });
  });
});

describe('buildSchemaObjectFromType input objects', () => {
  const schema = buildSchema(`
    type Query { test: String }
    input CreateUserInput {
      email: String!
      name: String
      age: Int
    }
  `);

  it('converts input object to JSON Schema object with properties and required', () => {
    const inputType = schema.getType('CreateUserInput')!;
    expect(
      buildSchemaObjectFromType(inputType as any, noCustomScalars),
    ).toEqual({
      type: 'object',
      properties: {
        email: { type: 'string' },
        name: { type: 'string' },
        age: { type: 'integer', format: 'int32' },
      },
      required: ['email'],
    });
  });
});

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
  `);

  it('extracts variables from operation and converts to JSON Schema', () => {
    const operation = `
      query GetWeather($location: String!, $units: TemperatureUnit) {
        getWeather(location: $location, units: $units) {
          temperature
          conditions
        }
      }
    `;
    const result = operationToInputSchema(operation, schema);
    expect(result).toEqual({
      type: 'object',
      properties: {
        location: { type: 'string' },
        units: { type: 'string', enum: ['CELSIUS', 'FAHRENHEIT'] },
      },
      required: ['location'],
    });
  });

  it('returns empty schema for operation with no variables', () => {
    const operation = `
      query GetDefaultWeather {
        getWeather(location: "Berlin") {
          temperature
        }
      }
    `;
    const result = operationToInputSchema(operation, schema);
    expect(result).toEqual({
      type: 'object',
      properties: {},
    });
  });
});

describe('selectionSetToOutputSchema', () => {
  const schema = buildSchema(`
    type Query {
      "Get weather data"
      getWeatherData(location: String!): WeatherData
      "Get users"
      users: [User!]!
    }
    type WeatherData {
      "Temperature in celsius"
      temperature: Float!
      "Weather conditions"
      conditions: String!
      "Humidity percentage"
      humidity: String!
    }
    type User {
      id: ID!
      name: String!
      address: Address
    }
    type Address {
      city: String!
      country: String!
    }
  `);

  it('generates output schema for scalar fields', () => {
    const operation = parse(`
      query GetWeather($location: String!) {
        getWeatherData(location: $location) {
          temperature
          conditions
          humidity
        }
      }
    `);
    const result = selectionSetToOutputSchema(operation, schema);
    expect(result).toEqual({
      type: 'object',
      properties: {
        temperature: {
          type: 'number',
          format: 'float',
          description: 'Temperature in celsius',
        },
        conditions: {
          type: 'string',
          description: 'Weather conditions',
        },
        humidity: {
          type: 'string',
          description: 'Humidity percentage',
        },
      },
    });
  });

  it('generates output schema for nested objects', () => {
    const operation = parse(`
      query GetUsers {
        users {
          id
          name
          address {
            city
            country
          }
        }
      }
    `);
    const result = selectionSetToOutputSchema(operation, schema);
    expect(result).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          address: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              country: { type: 'string' },
            },
          },
        },
      },
    });
  });

  it('includes field descriptions from schema', () => {
    const operation = parse(`
      query GetWeather($location: String!) {
        getWeatherData(location: $location) {
          temperature
        }
      }
    `);
    const result = selectionSetToOutputSchema(operation, schema);
    expect(result).toEqual({
      type: 'object',
      properties: {
        temperature: {
          type: 'number',
          format: 'float',
          description: 'Temperature in celsius',
        },
      },
    });
  });
});

describe('operationToInputSchema with descriptions', () => {
  const schema = buildSchema(`
    type Query {
      "Get weather data for a location"
      getWeather(
        "City name or postal code"
        location: String!
        "Temperature unit preference"
        units: TemperatureUnit
      ): Weather
    }
    type Weather {
      temperature: Float!
    }
    enum TemperatureUnit {
      CELSIUS
      FAHRENHEIT
    }
  `);

  it('includes argument descriptions in input schema', () => {
    const operation = `
      query GetWeather($location: String!, $units: TemperatureUnit) {
        getWeather(location: $location, units: $units) {
          temperature
        }
      }
    `;
    const result = operationToInputSchema(operation, schema);
    expect(result.properties!.location.description).toBe('City name or postal code');
    expect(result.properties!.units.description).toBe('Temperature unit preference');
  });

  it('omits description when argument has none', () => {
    const schemaNoDesc = buildSchema(`
      type Query {
        getWeather(location: String!): String
      }
    `);
    const operation = `query($location: String!) { getWeather(location: $location) }`;
    const result = operationToInputSchema(operation, schemaNoDesc);
    expect(result.properties!.location.description).toBeUndefined();
  });
});

describe('getToolDescriptionFromSchema', () => {
  const schema = buildSchema(`
    type Query {
      "Get current weather data for a location"
      getWeatherData(location: String!): String
      noDescription(id: ID!): String
    }
  `);

  it('returns field description from schema', () => {
    const operation = `query($location: String!) { getWeatherData(location: $location) }`;
    const desc = getToolDescriptionFromSchema(operation, schema);
    expect(desc).toBe('Get current weather data for a location');
  });

  it('returns undefined when field has no description', () => {
    const operation = `query($id: ID!) { noDescription(id: $id) }`;
    const desc = getToolDescriptionFromSchema(operation, schema);
    expect(desc).toBeUndefined();
  });
});
