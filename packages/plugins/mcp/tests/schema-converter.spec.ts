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

  it('handles input object variable', () => {
    const inputSchema = buildSchema(`
      type Query { createUser(input: UserInput!): String }
      input UserInput { name: String!, email: String! }
    `);
    const operation = `
      mutation CreateUser($input: UserInput!) {
        createUser(input: $input)
      }
    `;
    const result = operationToInputSchema(operation, inputSchema);
    expect(result.properties!['input']).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['name', 'email'],
    });
    expect(result.required).toContain('input');
  });

  it('handles list of input objects [InputObject!]!', () => {
    const inputSchema = buildSchema(`
      type Query { batchCreate(items: [ItemInput!]!): String }
      input ItemInput { title: String!, quantity: Int! }
    `);
    const operation = `
      mutation BatchCreate($items: [ItemInput!]!) {
        batchCreate(items: $items)
      }
    `;
    const result = operationToInputSchema(operation, inputSchema);
    expect(result.properties!['items']).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          quantity: { type: 'integer', format: 'int32' },
        },
        required: ['title', 'quantity'],
      },
    });
    expect(result.required).toContain('items');
  });

  it('handles nullable list of input objects [InputObject]', () => {
    const inputSchema = buildSchema(`
      type Query { search(filters: [FilterInput]): String }
      input FilterInput { field: String!, value: String! }
    `);
    const operation = `
      query Search($filters: [FilterInput]) {
        search(filters: $filters)
      }
    `;
    const result = operationToInputSchema(operation, inputSchema);
    expect(result.properties!['filters']).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['field', 'value'],
      },
    });
    expect(result.required ?? []).not.toContain('filters');
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
        getWeatherData: {
          type: ['object', 'null'],
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
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              address: {
                type: ['object', 'null'],
                properties: {
                  city: { type: 'string' },
                  country: { type: 'string' },
                },
              },
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
        getWeatherData: {
          type: ['object', 'null'],
          properties: {
            temperature: {
              type: 'number',
              format: 'float',
              description: 'Temperature in celsius',
            },
          },
        },
      },
    });
  });
});

describe('selectionSetToOutputSchema nullability', () => {
  const schema = buildSchema(`
    enum Status { ACTIVE INACTIVE }
    union Thing = A | B
    type A { a: String }
    type B { b: String }
    type Holder {
      "the thing"
      thing: Thing
    }
    type Inner { value: String! }
    type Outer {
      inner: Inner
      strictInner: Inner!
    }
    type Query {
      str: String
      strictStr: String!
      int: Int
      strictInt: Int!
      status: Status
      strictStatus: Status!
      tags: [String!]
      strictTags: [String!]!
      nullableItems: [String]!
      outer: Outer!
      holder: Holder!
    }
  `);

  const root = (field: string, selection = '') =>
    selectionSetToOutputSchema(parse(`{ ${field} ${selection} }`), schema)
      .properties![field]!;

  it('keeps the root wrapper a plain non-null object', () => {
    expect(selectionSetToOutputSchema(parse('{ str }'), schema).type).toBe(
      'object',
    );
  });

  it.each([
    ['str', { type: ['string', 'null'] }],
    ['int', { type: ['integer', 'null'], format: 'int32' }],
    [
      'status',
      { type: ['string', 'null'], enum: ['ACTIVE', 'INACTIVE', null] },
    ],
    ['tags', { type: ['array', 'null'], items: { type: 'string' } }],
    ['nullableItems', { type: 'array', items: { type: ['string', 'null'] } }],
  ])('allows null for nullable %s', (field, expected) => {
    expect(root(field)).toEqual(expected);
  });

  it.each([
    ['strictStr', { type: 'string' }],
    ['strictInt', { type: 'integer', format: 'int32' }],
    ['strictStatus', { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }],
    ['strictTags', { type: 'array', items: { type: 'string' } }],
  ])('keeps NonNull %s strict', (field, expected) => {
    expect(root(field)).toEqual(expected);
  });

  it('allows null for nullable nested objects only', () => {
    expect(root('outer', '{ inner { value } strictInner { value } }')).toEqual({
      type: 'object',
      properties: {
        inner: {
          type: ['object', 'null'],
          properties: { value: { type: 'string' } },
        },
        strictInner: {
          type: 'object',
          properties: { value: { type: 'string' } },
        },
      },
    });
  });

  it('wraps non-string types in anyOf and keeps the description', () => {
    const thing = root('holder', '{ thing { __typename } }').properties![
      'thing'
    ]!;
    expect(thing.description).toBe('the thing');
    expect(thing.anyOf).toHaveLength(2);
    expect(thing.anyOf![0]!.oneOf).toHaveLength(2);
    expect(thing.anyOf![1]).toEqual({ type: 'null' });
  });

  it('does not mutate shared enum or scalar extension schemas', () => {
    const operation = parse('{ status }');
    const first = selectionSetToOutputSchema(operation, schema);
    const second = selectionSetToOutputSchema(operation, schema);
    expect(second).toEqual(first);
    expect(second.properties!['status']!.enum).toEqual([
      'ACTIVE',
      'INACTIVE',
      null,
    ]);

    const colors = ['red', 'green'];
    const scalarSchema = buildSchema(`
      scalar Color
      type Query { color: Color }
    `);
    scalarSchema.getType('Color')!.extensions = {
      jsonSchema: { type: 'string', enum: colors },
    };
    const result = selectionSetToOutputSchema(parse('{ color }'), scalarSchema);
    expect(result.properties!['color']!.enum).toEqual(['red', 'green', null]);
    expect(colors).toEqual(['red', 'green']);
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
    expect(result.properties!['location']!.description).toBe(
      'City name or postal code',
    );
    expect(result.properties!['units']!.description).toBe(
      'Temperature unit preference',
    );
  });

  it('omits description when argument has none', () => {
    const schemaNoDesc = buildSchema(`
      type Query {
        getWeather(location: String!): String
      }
    `);
    const operation = `query($location: String!) { getWeather(location: $location) }`;
    const result = operationToInputSchema(operation, schemaNoDesc);
    expect(result.properties!['location']!.description).toBeUndefined();
  });

  it('collects argument descriptions from all root selections', () => {
    const multiFieldSchema = buildSchema(`
      type Query {
        getWeather(
          "City name"
          location: String!
        ): Weather
        getAlerts(
          "Severity filter"
          severity: String!
        ): [Alert!]!
      }
      type Weather { temperature: Float! }
      type Alert { message: String! }
    `);
    const operation = `
      query($location: String!, $severity: String!) {
        getWeather(location: $location) { temperature }
        getAlerts(severity: $severity) { message }
      }
    `;
    const result = operationToInputSchema(operation, multiFieldSchema);
    expect(result.properties!['location']!.description).toBe('City name');
    expect(result.properties!['severity']!.description).toBe('Severity filter');
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
