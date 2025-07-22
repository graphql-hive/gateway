import { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { MeshFetch, OnFetchHook } from '@graphql-mesh/types';
import { wrapFetchWithHooks } from '@graphql-mesh/utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDeduplicateRequest } from '../src/index.js';

export function wrapFetchWithPlugins(plugins: GatewayPlugin[]): MeshFetch {
  const onFetchHooks: OnFetchHook<any>[] = [];
  for (const plugin of plugins as GatewayPlugin[]) {
    if (plugin?.onFetch != null) {
      onFetchHooks.push(plugin.onFetch);
    }
  }
  return wrapFetchWithHooks(onFetchHooks);
}

const modules = ['node-fetch', '@whatwg-node/fetch'];
if (!process.versions.node?.startsWith('1')) {
  modules.push('undici');
}

describe('useDeduplicateRequest', () => {
  modules.forEach((fetchImplName) => {
    globalThis.ReadableStream ||= require(fetchImplName).ReadableStream;
    const Response = require(fetchImplName).Response;
    if (!Response) {
      return;
    }
    describe(fetchImplName, () => {
      let reqCount: number;

      async function originalFetch() {
        reqCount++;
        return new Response(
          JSON.stringify({
            data: {
              hello: 'world',
            },
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      }

      beforeEach(() => {
        reqCount = 0;
      });

      it('should deduplicate the same GET requests in the same context sequentially', async () => {
        const context = {};
        const fetchFn = wrapFetchWithPlugins([
          {
            onFetch({ setFetchFn }) {
              setFetchFn(originalFetch);
            },
          },
          useDeduplicateRequest(),
        ]);
        const url = 'http://localhost:9856/somePath';
        const response = await fetchFn(
          url,
          {
            headers: {
              Accept: 'application/json',
            },
          },
          context,
        );
        await response.text();
        const response2 = await fetchFn(
          url,
          {
            headers: {
              Accept: 'application/json',
            },
          },
          context,
        );
        await response2.text();
        expect(reqCount).toBe(1);
      });
      it('should deduplicate the same GET request in the same context in parallel', async () => {
        const context = {};
        const fetchFn = wrapFetchWithPlugins([
          {
            onFetch({ setFetchFn }) {
              setFetchFn(originalFetch);
            },
          },
          useDeduplicateRequest(),
        ]);
        const url = 'http://localhost:9856/somePath';
        const [response, response2] = await Promise.all([
          fetchFn(
            url,
            {
              headers: {
                Accept: 'application/json',
              },
            },
            context,
          ),
          fetchFn(
            url,
            {
              headers: {
                Accept: 'application/json',
              },
            },
            context,
          ),
        ]);
        await Promise.all([response.text(), response2.text()]);
        expect(reqCount).toBe(1);
      });
      it('should not deduplicate the different GET requests in the same context sent sequentially', async () => {
        const context = {};
        const fetchFn = wrapFetchWithPlugins([
          {
            onFetch({ setFetchFn }) {
              setFetchFn(originalFetch);
            },
          },
          useDeduplicateRequest(),
        ]);
        const url = 'http://localhost:9856/somePath';
        const response = await fetchFn(
          url,
          {
            headers: {
              Accept: 'application/json',
            },
          },
          context,
        );
        await response.text();
        const response2 = await fetchFn(
          url + '2',
          {
            headers: {
              Accept: 'application/json',
            },
          },
          context,
        );
        await response2.text();
        expect(reqCount).toBe(2);
      });
      it('should not deduplicate the different GET requests in the same context sent in parallel', async () => {
        const context = {};
        const fetchFn = wrapFetchWithPlugins([
          {
            onFetch({ setFetchFn }) {
              setFetchFn(originalFetch);
            },
          },
          useDeduplicateRequest(),
        ]);
        const url = 'http://localhost:9856/somePath';
        const [response, response2] = await Promise.all([
          fetchFn(
            url,
            {
              headers: {
                Accept: 'application/json',
              },
            },
            context,
          ),
          fetchFn(
            url + '2',
            {
              headers: {
                Accept: 'application/json',
              },
            },
            context,
          ),
        ]);
        await Promise.all([response.text(), response2.text()]);
        expect(reqCount).toBe(2);
      });
      it('should not deduplicate the same GET request in different contexts sent sequentially', async () => {
        const context = {};
        const context2 = {};
        const fetchFn = wrapFetchWithPlugins([
          {
            onFetch({ setFetchFn }) {
              setFetchFn(originalFetch);
            },
          },
          useDeduplicateRequest(),
        ]);
        const url = 'http://localhost:9856/somePath';
        const response = await fetchFn(
          url,
          {
            headers: {
              Accept: 'application/json',
            },
          },
          context,
        );
        await response.text();
        const response2 = await fetchFn(
          url,
          {
            headers: {
              Accept: 'application/json',
            },
          },
          context2,
        );
        await response2.text();
        expect(reqCount).toBe(2);
      });
      it('should not deduplicate the same GET request in different contexts sent in parallel', async () => {
        const context = {};
        const context2 = {};
        const fetchFn = wrapFetchWithPlugins([
          {
            onFetch({ setFetchFn }) {
              setFetchFn(originalFetch);
            },
          },
          useDeduplicateRequest(),
        ]);
        const url = 'http://localhost:9856/somePath';
        const [response, response2] = await Promise.all([
          fetchFn(
            url,
            {
              headers: {
                Accept: 'application/json',
              },
            },
            context,
          ),
          fetchFn(
            url,
            {
              headers: {
                Accept: 'application/json',
              },
            },
            context2,
          ),
        ]);
        await Promise.all([response.text(), response2.text()]);
        expect(reqCount).toBe(2);
      });
    });
  });
});
