import { createServer, Server } from 'http';
import { parse } from 'graphql';
import { createGraphQLError, createYoga } from 'graphql-yoga';

const typeDefs = parse(/* GraphQL */ `
  type Query {
    testNestedField: TestNestedField!
  }

  type TestNestedField {
    subgraph2_Nullable: TestSubgraph2Query
    subgraph2_NonNullable: TestSubgraph2Query!
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
`);

const resolvers = {
  Query: {
    testNestedField: () => ({
      subgraph2_Nullable: () => ({
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
      subgraph2_NonNullable: () => ({
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
};

export class TestSubgraph2 {
  public readonly port: number = this.getTestPort() + 2000;
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
