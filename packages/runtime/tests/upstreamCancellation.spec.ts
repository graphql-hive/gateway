import { createDisposableServer } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { createServerAdapter, Response } from '@whatwg-node/server';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';

describe('Upstream Cancellation', () => {
  it('cancels upstream requests when the client cancels', async () => {
    const serveRuntimeFetchCallAbortCtrl = new AbortController();
    let resolveDataSource: (response: Response) => void;
    const abortSpyOnDataSource = vi.fn(() => {
      resolveDataSource(new Response('Bye!'));
    });
    const dataSourceFetchSpy = vi.fn((res: Response) => res.text());
    const dataSourceAdapter = createServerAdapter((req) => {
      serveRuntimeFetchCallAbortCtrl.abort();
      req.signal.addEventListener('abort', abortSpyOnDataSource);
      return new Promise((resolve) => {
        resolveDataSource = resolve;
      });
    });
    await using dataSourceServer =
      await createDisposableServer(dataSourceAdapter);
    const upstreamGraphQL = createYoga({
      logging: false,
      schema: createSchema<{}>({
        typeDefs: /* GraphQL */ `
          type Query {
            hello: String
          }
        `,
        resolvers: {
          Query: {
            hello: (_root, _args, context) =>
              fetch(dataSourceServer.url, {
                signal: context.request.signal,
              }).then(dataSourceFetchSpy),
          },
        },
      }),
    });
    await using upstreamGraphQLServer =
      await createDisposableServer(upstreamGraphQL);
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: `${upstreamGraphQLServer.url}/graphql`,
      },
      upstreamCancellation: true,
      logging: false,
    });
    await using serveRuntimeServer = await createDisposableServer(gateway);
    const res$ = fetch(`${serveRuntimeServer.url}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
      signal: serveRuntimeFetchCallAbortCtrl.signal,
    });
    await expect(res$).rejects.toThrow();
    expect(dataSourceFetchSpy).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    expect(abortSpyOnDataSource).toHaveBeenCalled();
  });
});
