import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it, vitest } from 'vitest';

describe('AWS Sigv4', () => {
  it('signs the request correctly', async () => {
    const subgraphSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          hello: String
        }
      `),
      resolvers: {
        Query: {
          hello: () => 'world',
        },
      },
    });
    let receivedSubgraphRequest: Request | undefined;
    await using subgraphServer = createYoga({
      schema: subgraphSchema,
      plugins: [
        {
          onRequest({ request }) {
            receivedSubgraphRequest = request;
          },
        },
      ],
    });
    vitest.setSystemTime(new Date('2015-12-29T00:00:00Z'));
    await using gw = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'subgraph',
          schema: subgraphSchema,
          url: 'http://localhost:4001/graphql',
        },
      ]),
      awsSigv4: {
        service: 's3',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
      requestId: false,
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error - MeshFetch is not compatible with Yoga.fetch
          subgraphServer.fetch,
        ),
      ],
    });
    const res = await gw.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json();
    expect(body).toEqual({
      data: {
        hello: 'world',
      },
    });
    const authHeader = receivedSubgraphRequest?.headers.get('Authorization');
    expect(authHeader).toBe(
      'AWS4-HMAC-SHA256 ' +
        [
          'Credential=AKIAIOSFODNN7EXAMPLE/20151229/us-east-1/s3/aws4_request',
          'SignedHeaders=accept;content-length;content-type;host;x-amz-content-sha256;x-amz-date',
          'Signature=a6d3bd60591837efe08e405a94340ccecad1c15ece87f0a681d2caa22c07fc39',
        ].join(', '),
    );
  });
});
