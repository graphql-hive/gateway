import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
  getAvailablePort,
} from '@internal/testing';
import {
  GqlModuleOptions,
  GraphQLModule,
  GraphQLSchemaHost,
} from '@nestjs/graphql';
import { NodeAdapter, NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import {
  AsyncDisposableStack,
  DisposableSymbols,
} from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import { parse, printSchema, stripIgnoredCharacters } from 'graphql';
import { createClient } from 'graphql-ws';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';
import { HiveGatewayDriver, HiveGatewayDriverConfig } from '../src';

const schemaSDL = /* GraphQL */ `
  type Query {
    hello: String!
  }
`;

async function createNestApp(
  opts: Omit<HiveGatewayDriverConfig, 'supergraph'> &
    Omit<GqlModuleOptions, 'driver'> = {},
  httpAdapter?: NodeAdapter,
) {
  const disposableStack = new AsyncDisposableStack();
  const upstreamSchema = buildSubgraphSchema([
    {
      typeDefs: parse(schemaSDL),
      resolvers: {
        Query: {
          hello: () => 'world',
        },
      },
    },
  ]);
  const upstreamYoga = createYoga({ logging: false, schema: upstreamSchema });
  disposableStack.use(upstreamYoga);
  const upstreamServer = await createDisposableServer(upstreamYoga);
  disposableStack.use(upstreamServer);
  const supergraph = await composeLocalSchemasWithApollo([
    {
      name: 'upstream',
      schema: upstreamSchema,
      url: `${upstreamServer.url}/graphql`,
    },
  ]);

  const moduleRef = await Test.createTestingModule({
    imports: [
      GraphQLModule.forRoot<HiveGatewayDriverConfig>({
        driver: HiveGatewayDriver,
        supergraph,
        ...opts,
      }),
    ],
  }).compile();
  const app = httpAdapter
    ? moduleRef.createNestApplication(httpAdapter)
    : moduleRef.createNestApplication();
  disposableStack.defer(() => app.close());

  const port = await getAvailablePort();
  // app.init(); // app.listen() will call init
  await app.listen(port);

  return {
    app,
    port,
    [DisposableSymbols.asyncDispose]() {
      return disposableStack.disposeAsync();
    },
  };
}

async function runQuery(port: number) {
  const res = await fetch(`http://localhost:${port}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: /* GraphQL */ `
        query {
          hello
        }
      `,
    }),
  });
  expect(await res.json()).toEqual({
    data: {
      hello: 'world',
    },
  });
}

describe('NestJS', () => {
  it('should execute queries and have the correct schema', async () => {
    await using nestApp = await createNestApp();
    await runQuery(nestApp.port);
    const { schema } = nestApp.app.get(GraphQLSchemaHost);
    expect(stripIgnoredCharacters(printSchema(schema))).toBe(
      stripIgnoredCharacters(schemaSDL),
    );
  });

  it('should run transform schema only once', async () => {
    const transformFn = vi.fn((schema) => schema);
    await using nestApp = await createNestApp({
      transformSchema: transformFn,
    });
    await runQuery(nestApp.port);
    expect(transformFn).toHaveBeenCalledTimes(1);
  });

  it('should sort schema only once', async () => {
    const schemaChangeFn = vi.fn();
    await using nestApp = await createNestApp({
      sortSchema: true,
      plugins: () => [
        {
          onSchemaChange: schemaChangeFn,
        },
      ],
    });
    await runQuery(nestApp.port);
    expect(schemaChangeFn).toHaveBeenCalledTimes(2); // 1st time for the lazy Hive Gateway schema, 2nd time for the sorted  schema
  });

  it('should use cache', async () => {
    const onCacheSetErrorFn = vi.fn();
    await using nestApp = await createNestApp({
      cache: {
        type: 'localforage',
      },
      plugins: () => [
        {
          onCacheSet: () => ({
            onCacheSetError: onCacheSetErrorFn,
          }),
        },
      ],
    });
    await runQuery(nestApp.port);
    expect(onCacheSetErrorFn).not.toHaveBeenCalled();
  });

  describe('with @nestjs/platform-node', () => {
    it('should serve graphql-ws subscriptions', async () => {
      await using nestApp = await createNestApp(
        {
          subscriptions: { 'graphql-ws': true },
          typeDefs: /* GraphQL */ `
            type Subscription {
              countdown(from: Int!): Int!
            }
          `,
          resolvers: {
            Subscription: {
              countdown: {
                async *subscribe(_: unknown, { from }: { from: number }) {
                  for (let i = from; i >= 0; i--) {
                    yield { countdown: i };
                  }
                },
              },
            },
          },
        },
        new NodeAdapter(),
      );
      const client = createClient({
        url: `ws://localhost:${nestApp.port}/graphql`,
        retryAttempts: 0,
      });
      const values: unknown[] = [];
      try {
        for await (const result of client.iterate({
          query: /* GraphQL */ `
            subscription {
              countdown(from: 2)
            }
          `,
        })) {
          values.push(result);
        }
      } finally {
        await client.dispose();
      }
      expect(values).toEqual([
        { data: { countdown: 2 } },
        { data: { countdown: 1 } },
        { data: { countdown: 0 } },
      ]);
    });

    it('should execute queries and have the correct schema', async () => {
      await using nestApp = await createNestApp({}, new NodeAdapter());
      await runQuery(nestApp.port);
      const { schema } = nestApp.app.get(GraphQLSchemaHost);
      expect(stripIgnoredCharacters(printSchema(schema))).toBe(
        stripIgnoredCharacters(schemaSDL),
      );
    });

    it('should put the node request and response in the context', async () => {
      const onContextBuildingFn = vi.fn();
      await using nestApp = await createNestApp(
        {
          plugins: () => [
            {
              onContextBuilding: onContextBuildingFn,
            },
          ],
        },
        new NodeAdapter(),
      );
      await runQuery(nestApp.port);
      expect(onContextBuildingFn).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            req: expect.any(NodeRequest),
            res: expect.any(NodeResponse),
          }),
        }),
      );
    });
  });
});
