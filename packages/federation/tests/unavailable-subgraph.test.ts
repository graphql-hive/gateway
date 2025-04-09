import { buildSubgraphSchema } from '@apollo/subgraph';
import { dispose } from '@graphql-mesh/utils';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { createGraphQLError } from '@graphql-tools/utils';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
  DisposableServer,
} from '@internal/testing';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import { FormattedExecutionResult, parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Yoga gateway - subgraph unavailable', () => {
  describe('UNEXPECTED RESPONSE - FAILING TESTS', () => {
    describe('subgraph2 is unavailable', () => {
      const disposableStack = new AsyncDisposableStack();
      let gatewayServer: DisposableServer;
      beforeAll(async () => {
        const subgraph1Schema = buildSubgraphSchema({
          typeDefs: parse(/* GraphQL */ `
            type Query {
              testNestedField: TestNestedField
            }

            type TestNestedField {
              subgraph1: TestSubgraph1Query
            }

            type TestSubgraph1Query {
              testSuccessQuery: TestUser1
              testErrorQuery: TestUser1
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
                  testSuccessQuery: () => {
                    return {
                      id: 'user1',
                      email: 'user1@example.com',
                      sub1: true,
                    };
                  },
                  testErrorQuery: () => {
                    throw createGraphQLError('My original subgraph1 error!', {
                      extensions: {
                        code: 'BAD_REQUEST',
                      },
                    });
                  },
                }),
              }),
            },
          },
        });
        const subgraph1Yoga = createYoga({
          schema: subgraph1Schema,
        });
        disposableStack.use(subgraph1Yoga);
        const subgraph1Server = await createDisposableServer(subgraph1Yoga);
        disposableStack.use(subgraph1Server);
        const subgraph2Schema = buildSubgraphSchema({
          typeDefs: parse(/* GraphQL */ `
            type Query {
              testNestedField: TestNestedField
            }

            type TestNestedField {
              subgraph2: TestSubgraph2Query
            }

            type TestSubgraph2Query {
              testSuccessQuery: TestUser2
              testErrorQuery: TestUser2
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
                  testSuccessQuery: () => {
                    return {
                      id: 'user2',
                      email: 'user1@example.com',
                      sub2: true,
                    };
                  },
                  testErrorQuery: () => {
                    throw createGraphQLError('My original subgraph2 error!', {
                      extensions: {
                        code: 'BAD_REQUEST',
                      },
                    });
                  },
                }),
              }),
            },
          },
        });
        const subgraph2Yoga = createYoga({
          schema: subgraph2Schema,
        });
        disposableStack.use(subgraph2Yoga);
        const subgraph2Server = await createDisposableServer(subgraph2Yoga);
        const supergraphSdl = await composeLocalSchemasWithApollo([
          {
            schema: subgraph1Schema,
            name: 'subgraph1',
            url: `${subgraph1Server.url}/graphql`,
          },
          {
            schema: subgraph2Schema,
            name: 'subgraph2',
            url: `${subgraph2Server.url}/graphql`,
          },
        ]);
        const gatewayYoga = createYoga({
          schema: getStitchedSchemaFromSupergraphSdl({ supergraphSdl }),
          maskedErrors: false,
        });
        disposableStack.use(gatewayYoga);
        gatewayServer = await createDisposableServer(gatewayYoga);
        disposableStack.use(gatewayServer);
        // Close subgraph 2
        await dispose(subgraph2Server);
      });
      afterAll(() => disposableStack.disposeAsync());
      it('multiSubgraphQuery', async () => {
        const response = await fetch(`${gatewayServer.url}/graphql`, {
          method: 'POST',
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                testNestedField {
                  subgraph1 {
                    testSuccessQuery {
                      id
                      email
                      sub1
                    }
                  }
                  subgraph2 {
                    testSuccessQuery {
                      id
                      email
                      sub2
                    }
                  }
                }
              }
            `,
          }),
          headers: { 'content-type': 'application/json' },
        });
        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result).toEqual({
          data: {
            testNestedField: {
              subgraph1: {
                testSuccessQuery: {
                  id: 'user1',
                  email: 'user1@example.com',
                  sub1: true,
                },
              },
              subgraph2: null,
            },
          },
          errors: expect.arrayContaining([
            {
              message: expect.stringContaining('connect'),
              extensions: {
                request: {
                  body: '{"query":"{__typename testNestedField{subgraph2{testSuccessQuery{id email sub2}}}}"}',
                  method: 'POST',
                },
              },
              path: ['testNestedField'],
            },
          ]),
        });
      });
      it('subgraph2Query', async () => {
        const response = await fetch(`${gatewayServer.url}/graphql`, {
          method: 'POST',
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                testNestedField {
                  subgraph2 {
                    testErrorQuery {
                      id
                      email
                      sub2
                    }
                  }
                }
              }
            `,
          }),
          headers: { 'content-type': 'application/json' },
        });
        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result).toEqual({
          data: {
            testNestedField: null,
          },
          errors: expect.arrayContaining([
            {
              message: expect.stringContaining('connect'),
              extensions: {
                request: {
                  body: '{"query":"{__typename testNestedField{subgraph2{testErrorQuery{id email sub2}}}}"}',
                  method: 'POST',
                },
              },
              path: ['testNestedField'],
            },
          ]),
        });
      });
    });
  });
});
