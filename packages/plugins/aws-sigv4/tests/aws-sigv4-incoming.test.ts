import { buildSubgraphSchema } from '@apollo/subgraph';
import { createInlineSigningKeyProvider, useJWT } from '@graphql-hive/gateway';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { parse } from 'graphql';
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
  it('validates incoming requests', async () => {
    await using gw = createGatewayTester({
      subgraphs: [
        {
          name: 'subgraph',
          schema: subgraphSchema,
        },
      ],
      landingPage: false,
      graphqlEndpoint: '/',
      plugins: () => [
        useAWSSigv4({
          incoming: {
            secretAccessKey: () => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          },
        }),
      ],
    });
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
          'Content-Length': '30',
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
  it('works with JWT', async () => {
    const JWT_SECRET = 'a-string-secret-at-least-256-bits-long';
    await using gw = createGatewayTester({
      subgraphs: [
        {
          name: 'subgraph',
          schema: subgraphSchema,
        },
      ],
      landingPage: false,
      graphqlEndpoint: '/',
      plugins: () => [
        useJWT({
          signingKeyProviders: [createInlineSigningKeyProvider(JWT_SECRET)],
          reject: {
            invalidToken: false,
            missingToken: false,
          },
        }),
        useAWSSigv4({
          incoming: {
            enabled: (request, context) =>
              !('jwt' in context) &&
              !request.headers.get('authorization')?.startsWith('Bearer'),
            secretAccessKey: () => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          },
        }),
      ],
    });

    const sigv4res = await gw.fetch(
      'http://sigv4examplegraphqlbucket.s3-eu-central-1.amazonaws.com',
      {
        method: 'POST',
        headers: {
          accept:
            'application/graphql-response+json, application/json, multipart/mixed',
          Date: 'Mon, 29 Dec 2015 00:00:00 GMT',
          'content-type': 'application/json',
          Host: 'sigv4examplegraphqlbucket.s3-eu-central-1.amazonaws.com',
          'Content-Length': '30',
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
    const sigv4result = await sigv4res.json();
    expect(sigv4result).toEqual({
      data: { __typename: 'Query', hello: 'world' },
    });
    const jwtToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30';
    const jwtres = await gw.fetch('http://localhost:4000', {
      method: 'POST',
      headers: {
        accept:
          'application/graphql-response+json, application/json, multipart/mixed',
        'content-type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({
        query: '{__typename hello}',
      }),
    });
    const jwtresult = await jwtres.json();
    expect(jwtresult).toEqual({
      data: { __typename: 'Query', hello: 'world' },
    });
    const failedres = await gw.fetch('http://localhost:4000', {
      method: 'POST',
      headers: {
        accept:
          'application/graphql-response+json, application/json, multipart/mixed',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: '{__typename hello}',
      }),
    });
    expect(failedres.status).toBe(401);
    const failedresult = await failedres.json();
    expect(failedresult).toEqual({
      errors: [
        {
          message: 'Required headers are missing',
          extensions: { code: 'UNAUTHORIZED' },
        },
      ],
    });
  });
});
