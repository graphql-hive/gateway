import { it } from 'node:test';
import { execute } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { RenameTypes, wrapSchema } from '@graphql-tools/wrap';
import { propertySchema } from '@internal/testing/fixtures/schemas';
import { GraphQLSchema, parse } from 'graphql';
import { beforeAll, describe, expect, test } from 'vitest';

describe('RenameTypes', () => {
  describe('rename type', () => {
    let schema: GraphQLSchema;
    beforeAll(() => {
      const transforms = [
        new RenameTypes(
          (name: string) =>
            ({
              Property: 'House',
              Location: 'Spots',
              TestInterface: 'TestingInterface',
              DateTime: 'Datum',
              InputWithDefault: 'DefaultingInput',
              TestInterfaceKind: 'TestingInterfaceKinds',
              TestImpl1: 'TestImplementation1',
            })[name],
        ),
      ];
      schema = wrapSchema({
        schema: propertySchema,
        transforms,
      });
    });
    test('should work', async () => {
      const result = await execute({
        schema,
        document: parse(/* GraphQL */ `
          query ($input: DefaultingInput!) {
            interfaceTest(kind: ONE) {
              ... on TestingInterface {
                testString
              }
            }
            propertyById(id: "p1") {
              ... on House {
                id
              }
            }
            dateTimeTest
            defaultInputTest(input: $input)
          }
        `),
        variableValues: {
          input: {
            test: 'bar',
          },
        },
      });

      expect(result).toEqual({
        data: {
          dateTimeTest: '1987-09-25T12:00:00',
          defaultInputTest: 'bar',
          interfaceTest: {
            testString: 'test',
          },
          propertyById: {
            id: 'p1',
          },
        },
      });
    });
  });

  describe('namespacing', () => {
    let schema: GraphQLSchema;
    beforeAll(() => {
      const transforms = [
        new RenameTypes((name: string) => `_${name}`),
        new RenameTypes((name: string) => `Property${name}`),
      ];
      schema = wrapSchema({
        schema: propertySchema,
        transforms,
      });
    });
    test('should work', async () => {
      const result = await execute({
        schema,
        document: parse(/* GraphQL */ `
          query ($input: Property_InputWithDefault!) {
            interfaceTest(kind: ONE) {
              ... on Property_TestInterface {
                testString
              }
            }
            properties(limit: 1) {
              __typename
              id
            }
            propertyById(id: "p1") {
              ... on Property_Property {
                id
              }
            }
            dateTimeTest
            defaultInputTest(input: $input)
          }
        `),
        variableValues: {
          input: {
            test: 'bar',
          },
        },
      });

      expect(result).toEqual({
        data: {
          dateTimeTest: '1987-09-25T12:00:00',
          defaultInputTest: 'bar',
          interfaceTest: {
            testString: 'test',
          },
          properties: [
            {
              __typename: 'Property_Property',
              id: 'p1',
            },
          ],
          propertyById: {
            id: 'p1',
          },
        },
      });
    });
  });

  it('reproduction #1962', async () => {
    const downstreamSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        scalar DateTime

        type Article {
          id: ID!
          title: String!
          publishedAt: DateTime!
        }

        type Viewer {
          articlesByDate(date: DateTime!): [Article!]!
        }

        type Query {
          view: Viewer
        }
      `,
      resolvers: {
        DateTime: {
          serialize: (value: Date) => value.toISOString(),
          parseValue: (value: string) => new Date(value),
          parseLiteral: (ast: any) => new Date(ast.value),
        },
        Viewer: {
          articlesByDate: (_root, args) => {
            return [
              {
                id: '1',
                title: 'Test Article',
                publishedAt: args.date,
              },
            ];
          },
        },
        Query: {
          view() {
            return {};
          },
        },
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [
        {
          schema: downstreamSchema,
          transforms: [
            new RenameTypes((typeName) => {
              // Rename DateTime scalar to Datetime (lowercase 't')
              if (typeName === 'DateTime') return 'Datetime';
              return typeName;
            }),
          ],
        },
      ],
    });

    const testQuery = /* GraphQL */ `
      query GetArticles($date: Datetime!) {
        view {
          articlesByDate(date: $date) {
            id
            title
            publishedAt
          }
        }
      }
    `;

    const testVariables = {
      date: '2024-01-15T10:00:00Z',
    };

    const result = await execute({
      schema: stitchedSchema,
      document: parse(testQuery),
      variableValues: testVariables,
    });

    expect(result).toEqual({
      data: {
        view: {
          articlesByDate: [
            {
              id: '1',
              title: 'Test Article',
              publishedAt: '2024-01-15T10:00:00.000Z',
            },
          ],
        },
      },
    });
  });
});
