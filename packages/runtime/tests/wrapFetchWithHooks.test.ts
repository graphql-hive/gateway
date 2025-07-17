import { Logger } from '@graphql-hive/logger';
import { createServerAdapter, Response } from '@whatwg-node/server';
import type { GraphQLResolveInfo } from 'graphql';
import { expect, it } from 'vitest';
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
