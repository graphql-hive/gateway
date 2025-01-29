import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { ExecutionRequest } from '@graphql-tools/utils';
import { assertAsyncIterable } from '@internal/testing';
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
  it('should choose the best mutation root field', async () => {
    const SUBGRAPHA = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          test: String
        }

        type Mutation {
          testMutation: TestMutationResult
        }

        type TestMutationResult @key(fields: "shared") {
          onlyA: String
          shared: String
        }
      `),
      resolvers: {
        Query: {
          test: () => 'test',
        },
        Mutation: {
          testMutation: () => ({
            onlyA: 'onlyA',
            shared: 'shared',
          }),
        },
      },
    });
    const SUBGRAPHB = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          test: String
        }

        type Mutation {
          testMutation: TestMutationResult
        }

        type TestMutationResult @key(fields: "shared") {
          onlyB: String
          shared: String
        }
      `),
      resolvers: {
        Query: {
          test: () => 'test',
        },
        Mutation: {
          testMutation: () => ({
            onlyB: 'onlyB',
            shared: 'shared',
          }),
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

    const resultA = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        mutation {
          testMutation {
            onlyA
          }
        }
      `),
    });

    expect(resultA).toEqual({
      data: {
        testMutation: {
          onlyA: 'onlyA',
        },
      },
    });

    expect(onSubgraphExecuteFn).toHaveBeenCalledTimes(1);
    expect(onSubgraphExecuteFn.mock.calls[0]?.[0]).toBe('SUBGRAPHA');
    const resultB = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        mutation {
          testMutation {
            onlyB
          }
        }
      `),
    });

    expect(resultB).toEqual({
      data: {
        testMutation: {
          onlyB: 'onlyB',
        },
      },
    });

    expect(onSubgraphExecuteFn).toHaveBeenCalledTimes(2);
    expect(onSubgraphExecuteFn.mock.calls[1]?.[0]).toBe('SUBGRAPHB');
  });
  it('should not consider subscription types as resolvable from other roots', async () => {
    interface Review {
      id: string;
      url: string;
      comment: string;
    }
    const reviews: Review[] = [
      {
        id: 'r1',
        url: 'http://r1',
        comment: 'Tractor 👍',
      },
      {
        id: 'r2',
        url: 'http://r2',
        comment: 'Washing machine 👎',
      },
    ];
    const REVIEWS = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          allReviews: [Review!]!
        }
        type Subscription {
          newReview: Review!
        }
        type Review @key(fields: "id") @key(fields: "url") {
          id: ID!
          url: String!
          comment: String!
        }
      `),
      resolvers: {
        Query: {
          allReviews: () => reviews,
        },
        Subscription: {
          newReview: {
            async *subscribe() {
              yield { newReview: reviews[reviews.length - 1] };
            },
          },
        },
      },
    });

    const gatewaySchema = await getStitchedSchemaFromLocalSchemas({
      REVIEWS,
    });

    const newReviewSub = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        subscription {
          newReview {
            id
          }
        }
      `),
    });
    assertAsyncIterable(newReviewSub);
    const iter = newReviewSub[Symbol.asyncIterator]();

    await expect(iter.next()).resolves.toMatchInlineSnapshot(`
      {
        "done": false,
        "value": {
          "data": {
            "newReview": {
              "id": "r2",
            },
          },
        },
      }
    `);

    await expect(iter.next()).resolves.toMatchInlineSnapshot(`
      {
        "done": true,
        "value": undefined,
      }
    `);
  });
});
