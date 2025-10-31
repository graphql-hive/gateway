import { buildSubgraphSchema } from '@apollo/subgraph';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { useAWSSigv4 } from '@graphql-hive/plugin-aws-sigv4';
import { usingHiveRouterQueryPlanner } from '~internal/env';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

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
    await using gw = createGatewayTester({
      subgraphs: [
        {
          name: 'subgraph',
          schema: subgraphSchema,
          host: 'sigv4examplegraphqlbucket.s3-eu-central-1.amazonaws.com',
          yoga: {
            plugins: [
              {
                onRequest({ request }) {
                  receivedSubgraphRequest = request;
                },
              },
            ],
            landingPage: false,
            graphqlEndpoint: '/',
          },
        },
      ],
      transportEntries: {
        subgraph: {
          headers: [['Date', 'Mon, 29 Dec 2015 00:00:00 GMT']],
        },
      },
      requestId: false,
      plugins: () => [
        useAWSSigv4({
          outgoing: {
            accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
            secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          },
        }),
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
          // s3 and eu-central-1 extracted from the URL
          'Credential=AKIAIOSFODNN7EXAMPLE/20151229/eu-central-1/s3/aws4_request',
          'SignedHeaders=accept;content-length;content-type;date;host;x-amz-content-sha256;x-amz-date',
          usingHiveRouterQueryPlanner()
            ? // different body hash due to different query planner implementations
              'Signature=6f39713ec7055a3c42088a38b76ebfc41623d805c13d1923397878f58a40ce0d'
            : 'Signature=80917aae9a6fcd148c4db418f37bcdc303143dba565be0c0c37bff19710a6f23',
        ].join(', '),
    );
  });
});
