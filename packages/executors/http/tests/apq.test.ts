import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { fetch } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashSHA256 } from '../src/utils';

describe('APQ to the upstream', () => {
  let apolloServer: ApolloServer | undefined;
  afterEach(() => apolloServer?.stop());
  it('works', async () => {
    apolloServer = new ApolloServer({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => 'world',
        },
      },
    });
    const { url } = await startStandaloneServer(apolloServer, {
      listen: { port: 0 },
    });
    const tracedFetch = vi.fn(fetch);
    await using executor = buildHTTPExecutor({
      endpoint: url,
      apq: true,
      fetch: tracedFetch,
    });
    const document = parse(/* GraphQL */ `
      query {
        hello
      }
    `);
    await expect(
      executor({
        document,
      }),
    ).resolves.toEqual({
      data: { hello: 'world' },
    });
    // First it checks whether server has the query, then it sends the query
    expect(tracedFetch.mock.calls).toHaveLength(2);
    const query = defaultPrintFn(document);
    const sha256Hash = await hashSHA256(query);
    expect(tracedFetch.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      }),
    );
    expect(tracedFetch.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        query,
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      }),
    );
    tracedFetch.mockClear();
    // On the following requests, it should only send the hash
    await expect(
      executor({
        document,
      }),
    ).resolves.toEqual({
      data: { hello: 'world' },
    });
    expect(tracedFetch.mock.calls).toHaveLength(1);
    expect(tracedFetch.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      }),
    );
  });
});
