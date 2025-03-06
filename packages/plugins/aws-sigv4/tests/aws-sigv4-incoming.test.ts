import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { useAWSSigv4 } from '../src';

describe('AWS Sigv4 Incoming requests', () => {
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
  const subgraphServer = createYoga({
    schema: subgraphSchema,
  });
  const gw = createGatewayRuntime({
    supergraph: composeLocalSchemasWithApollo([
      {
        name: 'subgraph',
        schema: subgraphSchema,
        url: 'http://localhost:4000/graphql',
      },
    ]),
    landingPage: false,
    graphqlEndpoint: '/',
    plugins: () => [
      useAWSSigv4({
        incoming: {
          secretKey: () => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
      }),
      useCustomFetch(
        // @ts-expect-error - MeshFetch is not compatible with Yoga.fetch
        subgraphServer.fetch,
      ),
    ],
  });
  it('validates incoming requests', async () => {
    const response = await gw.fetch(
      'http://sigv4examplegraphqlbucket.s3-eu-central-1.amazonaws.com',
      {
        method: 'POST',
        headers: {
          accept:
            'application/graphql-response+json, application/json, multipart/mixed',
          Date: 'Mon, 29 Dec 2015 00:00:00 GMT',
          'content-type': 'application/json',
          Host: 'sigv4examplegraphqlbucket.s3-eu-central-1.amazonaws.com',
          'Content-Length': 30,
          'X-Amz-Content-Sha256':
            '34c77dc7b593717e0231ac99a16ae3be5ee2e8d652bce6518738a6449dfd2647',
          'X-Amz-Date': '20151229T000000Z',
          Authorization:
            'AWS4-HMAC-SHA256 ' +
            [
              // s3 and eu-central-1 extracted from the URL
              'Credential=AKIAIOSFODNN7EXAMPLE/20151229/eu-central-1/s3/aws4_request',
              'SignedHeaders=accept;content-length;content-type;date;host;x-amz-content-sha256;x-amz-date',
              'Signature=80917aae9a6fcd148c4db418f37bcdc303143dba565be0c0c37bff19710a6f23',
            ].join(', '),
        },
        body: JSON.stringify({
          query: '{__typename hello}',
        }),
      },
    );
    const result = await response.json();
    expect(result).toEqual({ data: { __typename: 'Query', hello: 'world' } });
  });
});
