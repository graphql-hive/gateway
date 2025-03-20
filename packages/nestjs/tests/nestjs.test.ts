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
import { Test } from '@nestjs/testing';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import { parse, printSchema, stripIgnoredCharacters } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { afterAll, describe, expect, it, vitest } from 'vitest';
import { HiveGatewayDriver, HiveGatewayDriverConfig } from '../src';

const disposableStack = new AsyncDisposableStack();
afterAll(() => disposableStack.disposeAsync());

const schemaSDL = /* GraphQL */ `
  type Query {
    hello: String!
  }
`;
async function createNestApp(
  opts: Omit<HiveGatewayDriverConfig, 'supergraph'> &
    Omit<GqlModuleOptions, 'driver'> = {},
) {
  const upstreamSchema = buildSubgraphSchema({
    typeDefs: parse(schemaSDL),
    resolvers: {
      Query: {
        hello: () => 'world',
      },
    },
  });
  const upstreamYoga = createYoga({ schema: upstreamSchema });
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
  const app = moduleRef.createNestApplication();
  disposableStack.defer(() => app.close());

  const port = await getAvailablePort();
  // app.init(); // app.listen() will call init
  await app.listen(port);

  return [app, port] as const;
}

describe('NestJS', () => {
  it('should execute queries and have the correct schama', async () => {
    const [app, port] = await createNestApp();
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
    const { schema } = app.get(GraphQLSchemaHost);
    expect(stripIgnoredCharacters(printSchema(schema))).toBe(
      stripIgnoredCharacters(schemaSDL),
    );
  });

  it('should run transform schema only once', async () => {
    const transformFn = vitest.fn((schema) => schema);
    await createNestApp({
      transformSchema: transformFn,
    });
    expect(transformFn).toHaveBeenCalledTimes(1);
  });

  it('should sort schema only once', async () => {
    const schemaChangeFn = vitest.fn();
    await createNestApp({
      sortSchema: true,
      plugins: () => [
        {
          onSchemaChange: schemaChangeFn,
        },
      ],
    });
    expect(schemaChangeFn).toHaveBeenCalledTimes(2); // 1st time for the lazy Hive Gateway schema, 2nd time for the sorted  schema
  });

  it('should use cache', async () => {
    const onCacheSetFn = vitest.fn();
    const [, port] = await createNestApp({
      cache: {
        type: 'localforage',
      },
      plugins: () => [
        {
          onCacheSet: () => ({
            onCacheSetError: onCacheSetFn,
          }),
        },
      ],
    });
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
    await expect(res.json()).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "hello": "world",
        },
      }
    `);
    expect(onCacheSetFn).not.toHaveBeenCalled();
  });
});
