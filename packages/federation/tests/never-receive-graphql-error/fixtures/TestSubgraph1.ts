import { createServer, Server } from 'http';
import { parse } from 'graphql';
import { createGraphQLError, createYoga } from 'graphql-yoga';
import { getTestPort, pubSub } from './TestEnvironment';

export const userMock1 = {
  id: 'user1',
  email: 'user1@example.com',
};

const typeDefs = parse(/* GraphQL */ `
  type Query {
    testNestedField: TestNestedField
  }

  type Subscription {
    testSuccessSubscription: TestUser1
    testErrorSubscription: TestUser1
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
  }
`);

const resolvers = {
  Query: {
    testNestedField: () => ({
      subgraph1: () => ({
        testSuccessQuery: () => {
          return userMock1;
        },
        testErrorQuery: () => {
          throw createGraphQLError('My subgraph1 error!', {
            extensions: {
              code: 'BAD_REQUEST',
            },
          });
        },
      }),
    }),
  },
  Subscription: {
    testSuccessSubscription: {
      subscribe: () => {
        return pubSub.subscribe('test-topic');
      },
      resolve: (data: Record<string, any>) => {
        return data;
      },
    },
    testErrorSubscription: {
      subscribe: () => {
        throw createGraphQLError('My subgraph1 error!', {
          extensions: {
            code: 'BAD_REQUEST',
          },
        });
      },
      resolve: (data: Record<string, any>) => {
        return data;
      },
    },
  },
};

export class TestSubgraph1 {
  public readonly port: number = getTestPort() + 1000;
  private subgraph?: Server;

  public async start(): Promise<void> {
    // dynamic import is used only due to incompatibility with graphql@15
    const { buildSubgraphSchema } = await import('@apollo/subgraph');
    const yoga = createYoga({
      schema: buildSubgraphSchema({ typeDefs, resolvers }),
    });
    this.subgraph = createServer(yoga);

    return new Promise<void>((resolve) => {
      this.subgraph?.listen(this.port, () => resolve());
    });
  }

  public async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.subgraph?.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
