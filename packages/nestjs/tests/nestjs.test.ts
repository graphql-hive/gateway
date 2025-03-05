import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
} from '@internal/testing';
import { INestApplication } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { HiveGatewayDriver, HiveGatewayDriverConfig } from '../src';

describe.skipIf(process.env['LEAK_TEST'])('NestJS', () => {
  let app: INestApplication;
  const disposableStack = new AsyncDisposableStack();
  beforeAll(async () => {
    const upstreamSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          hello: String!
        }
      `),
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
  it('works', () => {
    return supertest(app.getHttpServer())
      .post('/graphql')
      .send({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      })
      .expect(200, {
        data: {
          hello: 'world',
        },
      });
  });
});
