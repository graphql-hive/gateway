import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
  getAvailablePort,
} from '@internal/testing';
import { INestApplication } from '@nestjs/common';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import { parse, printSchema, stripIgnoredCharacters } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HiveGatewayDriver, HiveGatewayDriverConfig } from '../src';

describe.skipIf(process.env['LEAK_TEST'])('NestJS', () => {
  let app: INestApplication;
  const disposableStack = new AsyncDisposableStack();
  const schemaSDL = /* GraphQL */ `
    type Query {
      hello: String!
    }
  `;
  beforeAll(async () => {
    const upstreamSchema = buildSubgraphSchema({
      typeDefs: parse(schemaSDL),
      resolvers: {
        Query: {
          hello: () => 'world',
        },
      },
    });
    const upstreamYoga = createYoga({
      schema: upstreamSchema,
    });
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
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    disposableStack.defer(() => app.close());
    return app.init();
  });
  afterAll(() => disposableStack.disposeAsync());
  it('works', async () => {
    const port = await getAvailablePort();
    await app.listen(port);
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
});
