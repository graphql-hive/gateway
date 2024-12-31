import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { ExecutionRequest } from '@graphql-tools/utils';
import { ExecutionResult, parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

describe('Shared Root Fields', () => {
  it('Aliased shared root fields issue #6613', async () => {
    const query = /* GraphQL */ `
      query {
        testNestedField {
          subgraph1 {
            id
            email
            sub1
          }
          testUserAlias: subgraph2 {
            id
            email
            sub2
          }
        }
      }
    `;

    const expectedResult = {
      data: {
        testNestedField: {
          subgraph1: {
            id: 'user1',
            email: 'user1@example.com',
            sub1: true,
          },
          testUserAlias: {
            id: 'user2',
            email: 'user2@example.com',
            sub2: true,
          },
        },
      },
    };

    const subgraph1 = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          testNestedField: TestNestedField
        }

        type TestNestedField {
          subgraph1: TestUser1!
        }

        type TestUser1 {
          id: String!
          email: String!
          sub1: Boolean!
        }
      `),
      resolvers: {
        Query: {
          testNestedField: () => ({
            subgraph1: () => ({
              id: 'user1',
              email: 'user1@example.com',
              sub1: true,
            }),
          }),
        },
      },
    });
    const subgraph2 = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          testNestedField: TestNestedField
        }

        type TestNestedField {
          subgraph2: TestUser2!
        }

        type TestUser2 {
          id: String!
          email: String!
          sub2: Boolean!
        }
      `),
      resolvers: {
        Query: {
          testNestedField: () => ({
            subgraph2: () => ({
              id: 'user2',
              email: 'user2@example.com',
              sub2: true,
            }),
          }),
        },
      },
    });

    const gatewaySchema = await getStitchedSchemaFromLocalSchemas({
      subgraph1,
      subgraph2,
    });

    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(query),
    });

    expect(result).toEqual(expectedResult);
  });
  it('Mutations should not be batched', async () => {
    const SUBGRAPHA = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          test: String
        }

        type Mutation {
          testMutation: String
        }
      `),
      resolvers: {
        Query: {
          test: () => 'test',
        },
        Mutation: {
          testMutation: () => 'testMutation',
        },
      },
    });
    const SUBGRAPHB = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          test: String
        }

        type Mutation {
          testMutation: String
        }
      `),
      resolvers: {
        Query: {
          test: () => 'test',
        },
        Mutation: {
          testMutation: () => 'testMutation',
        },
      },
    });
    const onSubgraphExecuteFn =
      vi.fn<
        (
          subgraph: string,
          executionRequest: ExecutionRequest,
          result: ExecutionResult | AsyncIterable<ExecutionResult>,
        ) => void
      >();
    const gatewaySchema = await getStitchedSchemaFromLocalSchemas(
      {
        SUBGRAPHA,
        SUBGRAPHB,
      },
      onSubgraphExecuteFn,
    );

    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        mutation {
          testMutation
        }
      `),
    });

    expect(result).toEqual({
      data: {
        testMutation: 'testMutation',
      },
    });

    expect(onSubgraphExecuteFn).toHaveBeenCalledTimes(1);
  });
});
