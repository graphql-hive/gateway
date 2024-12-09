import { createServer, Server } from 'http';
import { parse } from 'graphql';
import { createGraphQLError, createYoga } from 'graphql-yoga';

const typeDefs = parse(/* GraphQL */ `
  type Query {
    testNestedField: TestNestedField!
  }

  type TestNestedField {
    subgraph1_Nullable: TestSubgraph1Query
    subgraph1_NonNullable: TestSubgraph1Query!
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
`);

const resolvers = {
  Query: {
    testNestedField: () => ({
      subgraph1_Nullable: () => ({
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
      subgraph1_NonNullable: () => ({
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
};

export class TestSubgraph1 {
  public readonly port: number = this.getTestPort() + 1000;
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

  private getTestPort(): number {
    return parseInt(process.env['VITEST_POOL_ID'] ?? '1') + 3000;
  }
}
