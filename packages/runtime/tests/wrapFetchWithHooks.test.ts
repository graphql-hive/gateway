import { Logger } from '@graphql-hive/logger';
import { createDisposableServer, type MaybePromise } from '@internal/testing';
import { createServerAdapter, Response } from '@whatwg-node/server';
import { buildSchema, type GraphQLResolveInfo } from 'graphql';
import { expect, it } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import type { GatewayConfigContext, GatewayPlugin } from '../src/types';
import {
  wrapFetchWithHooks,
  type FetchInstrumentation,
} from '../src/wrapFetchWithHooks';

it('should wrap fetch instrumentation', async () => {
  await using adapter = createServerAdapter(() =>
    Response.json({ hello: 'world' }),
  );
  let receivedExecutionRequest;
  const fetchInstrumentation: FetchInstrumentation = {
    fetch: async ({ executionRequest }, wrapped) => {
      receivedExecutionRequest = executionRequest;
      await wrapped();
    },
  };
  const wrappedFetch = wrapFetchWithHooks(
    [
      ({ setFetchFn }) => {
        setFetchFn(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          adapter.fetch,
        );
      },
    ],
    new Logger({ level: false }),
    () => fetchInstrumentation,
  );
  const executionRequest = {};
  const res = await wrappedFetch('http://localhost:4000', {}, {}, {
    executionRequest,
  } as GraphQLResolveInfo);
  expect(await res.json()).toEqual({ hello: 'world' });
  expect(receivedExecutionRequest).toBe(executionRequest);
});

const serverAdapter = createServerAdapter(() =>
  Response.json({ hello: 'world' }),
);
const dummySchema = buildSchema(/* GraphQL */ `
  type Query {
    hello: String!
  }
`);

it('ctx.fetch available on onPluginInit', async () => {
  await using testServer = await createDisposableServer(serverAdapter);
  let res$: MaybePromise<Response> | undefined;
  function useMyPlugin<TContext extends Record<string, any>>(
    ctx: GatewayConfigContext,
  ): GatewayPlugin<TContext> {
    return {
      onPluginInit() {
        res$ = ctx.fetch(testServer.url);
      },
    };
  }
  await using _gw = createGatewayRuntime({
    supergraph: () => dummySchema,
    plugins: (ctx) => [useMyPlugin(ctx)],
  });
  const res = await res$;
  const json = await res?.json();
  expect(json).toEqual({ hello: 'world' });
});

it('ctx.fetch available on plugin factory', async () => {
  await using testServer = await createDisposableServer(serverAdapter);
  let res$: MaybePromise<Response> | undefined;
  function useMyPlugin<TContext extends Record<string, any>>(
    ctx: GatewayConfigContext,
  ): GatewayPlugin<TContext> {
    res$ = ctx.fetch(testServer.url);
    return {};
  }
  await using _gw = createGatewayRuntime({
    supergraph: () => dummySchema,
    plugins: (ctx) => [useMyPlugin(ctx)],
  });
  const res = await res$;
  const json = await res?.json();
  expect(json).toEqual({ hello: 'world' });
});

it('ctx.fetch available on onYogaInit', async () => {
  await using testServer = await createDisposableServer(serverAdapter);
  let res$: MaybePromise<Response> | undefined;
  function useMyPlugin<TContext extends Record<string, any>>(
    ctx: GatewayConfigContext,
  ): GatewayPlugin<TContext> {
    return {
      onYogaInit() {
        res$ = ctx.fetch(testServer.url);
      },
    };
  }
  await using _gw = createGatewayRuntime({
    supergraph: () => dummySchema,
    plugins: (ctx) => [useMyPlugin(ctx)],
  });
  const res = await res$;
  const json = await res?.json();
  expect(json).toEqual({ hello: 'world' });
});
