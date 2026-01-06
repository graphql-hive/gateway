import { setTimeout } from 'timers/promises';
import type { KeyValueCache } from '@graphql-mesh/types';
import {
  createDisposableServer,
  executeFetch,
  isDebug,
} from '@internal/testing';
import { createServerAdapter } from '@whatwg-node/server';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';

/**
 * Polls until the cache has at least one entry or times out.
 */
async function waitForCachePopulated(
  cache: { store: Map<string, unknown> },
  timeoutMs = 2000,
  intervalMs = 10,
): Promise<void> {
  const start = Date.now();
  while (cache.store.size === 0) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for cache to be populated');
    }
    await setTimeout(intervalMs);
  }
}

/**
 * Creates an in-memory KeyValueCache for testing with TTL support.
 */
function createInMemoryCache(): KeyValueCache<string> & {
  store: Map<string, { value: string; expiresAt?: number }>;
} {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    store,
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async set(key: string, value: string, options?: { ttl?: number | null }) {
      const expiresAt = options?.ttl
        ? Date.now() + options.ttl * 1000
        : undefined;
      store.set(key, { value, expiresAt });
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async getKeysByPrefix(prefix: string) {
      const keys: string[] = [];
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    },
  };
}

describe('Persisted Documents Layer 2 Cache', () => {
  const token = 'test-cdn-token';
  const documentId = 'graphql-app~1.0.0~abc123';
  const documentContent = /* GraphQL */ `
    query TestQuery {
      foo
    }
  `;

  function createUpstreamServer() {
    return createYoga({
      schema: createSchema({
        typeDefs: /* GraphQL */ `
          type Query {
            foo: String
          }
        `,
        resolvers: {
          Query: {
            foo: () => 'bar',
          },
        },
      }),
    });
  }

  describe('with gateway cache', () => {
    it('populates L2 cache and shares across gateway instances', async () => {
      const cdnRequestCount = vi.fn();
      const sharedCache = createInMemoryCache();

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            cdnRequestCount();
            const hiveCdnKey = req.headers.get('x-hive-cdn-key');
            if (hiveCdnKey !== token) {
              return new Response('Unauthorized', { status: 401 });
            }
            return new Response(documentContent);
          }
          return new Response('Not Found', { status: 404 });
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      // First gateway instance
      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway1, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      await waitForCachePopulated(sharedCache);

      // Second gateway instance fresh L1 cache, should use shared L2 cache
      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway2, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });

      // L2 cache working: CDN called once. Not working: CDN called twice.
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);
    });

    it('caches not-found documents to avoid repeated CDN requests', async () => {
      const cdnRequestCount = vi.fn();
      const sharedCache = createInMemoryCache();
      const notFoundDocumentId = 'nonexistent~1.0.0~xyz789';

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.includes('/apps/nonexistent/')) {
            cdnRequestCount();
            return new Response('Not Found', { status: 404 });
          }
          return new Response('OK');
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      // First gateway instance
      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheNotFoundTtlSeconds: 60,
        },
        logging: isDebug(),
      });

      const result1 = await gateway1.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: notFoundDocumentId }),
      });
      expect(result1.status).toBe(200);
      const json1 = await result1.json();
      expect(json1.errors).toBeDefined();
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      await waitForCachePopulated(sharedCache);

      // Second gateway instance fresh L1 cache, should use negative cache
      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheNotFoundTtlSeconds: 60,
        },
        logging: isDebug(),
      });

      const result2 = await gateway2.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: notFoundDocumentId }),
      });
      expect(result2.status).toBe(200);
      const json2 = await result2.json();
      expect(json2.errors).toBeDefined();

      // Negative cache working: CDN called once. Not working: CDN called twice.
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);
    });

    it('disables negative caching when cacheNotFoundTtlSeconds is 0', async () => {
      const cdnRequestCount = vi.fn();
      const sharedCache = createInMemoryCache();
      const notFoundDocumentId = 'nonexistent~1.0.0~xyz789';

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.includes('/apps/nonexistent/')) {
            cdnRequestCount();
            return new Response('Not Found', { status: 404 });
          }
          return new Response('OK');
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      // First gateway with negative caching disabled
      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheNotFoundTtlSeconds: 0, // Explicitly disable negative caching
        },
        logging: isDebug(),
      });

      await gateway1.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: notFoundDocumentId }),
      });
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      // Second gateway instance should hit CDN again since negative caching is disabled
      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheNotFoundTtlSeconds: 0,
        },
        logging: isDebug(),
      });

      await gateway2.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: notFoundDocumentId }),
      });

      // Negative caching disabled: CDN called twice. Enabled: CDN called once.
      expect(cdnRequestCount).toHaveBeenCalledTimes(2);
    });

    it('respects not-found TTL and re-fetches after expiration', async () => {
      const cdnRequestCount = vi.fn();
      const sharedCache = createInMemoryCache();
      const notFoundDocumentId = 'nonexistent~1.0.0~xyz789';
      const shortNotFoundTtl = 1; // 1 second TTL for faster test

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.includes('/apps/nonexistent/')) {
            cdnRequestCount();
            return new Response('Not Found', { status: 404 });
          }
          return new Response('OK');
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      // First gateway caches the not-found result
      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheNotFoundTtlSeconds: shortNotFoundTtl,
        },
        logging: isDebug(),
      });

      await gateway1.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: notFoundDocumentId }),
      });
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      await waitForCachePopulated(sharedCache);

      // Wait for not-found TTL to expire
      await setTimeout((shortNotFoundTtl + 0.5) * 1000);

      // Second gateway after TTL expiration should re-fetch from CDN
      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheNotFoundTtlSeconds: shortNotFoundTtl,
        },
        logging: isDebug(),
      });

      await gateway2.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: notFoundDocumentId }),
      });

      // TTL expired: CDN called twice. TTL not working: CDN called once.
      expect(cdnRequestCount).toHaveBeenCalledTimes(2);
    });

    it('uses custom key prefix in cache keys', async () => {
      const cache = createInMemoryCache();
      const customPrefix = 'my-app:pd:';

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            return new Response(documentContent);
          }
          return new Response('Not Found', { status: 404 });
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      await using gateway = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheKeyPrefix: customPrefix,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });

      await waitForCachePopulated(cache);

      const keys = Array.from(cache.store.keys());
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every((key) => key.startsWith(customPrefix))).toBe(true);
    });

    it('serves from L2 cache when CDN is unavailable', async () => {
      const cdnRequestCount = vi.fn();
      const sharedCache = createInMemoryCache();

      // First: CDN is available, populate cache
      await using cdnServer1 = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            cdnRequestCount();
            return new Response(documentContent);
          }
          return new Response('Not Found', { status: 404 });
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer1.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway1, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      await waitForCachePopulated(sharedCache);

      // Second: CDN is down, but L2 cache should serve the document
      await using cdnServer2 = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            cdnRequestCount();
            return new Response('Service Unavailable', { status: 503 });
          }
          return new Response('Not Found', { status: 404 });
        }),
      );

      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer2.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      // Should still work because L2 cache has the document
      await expect(executeFetch(gateway2, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });

      // CDN was only called once (first request), second gateway used L2 cache
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);
    });

    it('cache errors do not break requests', async () => {
      const failingCache: KeyValueCache<string> = {
        async get() {
          throw new Error('Cache get failed');
        },
        async set() {
          throw new Error('Cache set failed');
        },
        async delete() {
          throw new Error('Cache delete failed');
        },
        async getKeysByPrefix() {
          throw new Error('Cache getKeysByPrefix failed');
        },
      };

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            return new Response(documentContent);
          }
          return new Response('Not Found', { status: 404 });
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      await using gateway = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: failingCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      // Request should succeed even though L2 cache fails (falls back to CDN)
      await expect(executeFetch(gateway, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });
    });

    it('respects TTL and expires cached documents', async () => {
      const cdnRequestCount = vi.fn();
      const sharedCache = createInMemoryCache();
      const shortTtlSeconds = 1; // 1 second TTL

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            cdnRequestCount();
            return new Response(documentContent);
          }
          return new Response('Not Found', { status: 404 });
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      // First gateway populate cache with short TTL
      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: shortTtlSeconds,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway1, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      await waitForCachePopulated(sharedCache);

      // Wait for TTL to expire
      await setTimeout((shortTtlSeconds + 0.5) * 1000);

      // Second gateway cache should be expired, must hit CDN again
      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: shortTtlSeconds,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway2, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });

      // TTL expired: CDN called twice. TTL not working: CDN called once.
      expect(cdnRequestCount).toHaveBeenCalledTimes(2);
    });

    it('gracefully falls back to CDN when cache options are provided but no gateway cache exists', async () => {
      const cdnRequestCount = vi.fn();

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            cdnRequestCount();
            const hiveCdnKey = req.headers.get('x-hive-cdn-key');
            if (hiveCdnKey !== token) {
              return new Response('Unauthorized', { status: 401 });
            }
            return new Response(documentContent);
          }
          return new Response('Not Found', { status: 404 });
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      // First gateway instance WITHOUT gateway-level cache but WITH cache options
      // This should log a warning and fall back to CDN-only mode (no L2 cache)
      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        // No cache configured cache options will be ignored with a warning
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: 3600, // Cache option provided but no gateway cache
        },
        logging: isDebug(),
      });

      // Request from first gateway should hit CDN
      await expect(executeFetch(gateway1, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      // Second gateway instance (fresh L1 cache) should also hit CDN
      // since there's no L2 cache to share between instances
      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        // No cache configured
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway2, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });
      // No L2 cache: CDN called twice. With L2 cache: CDN called once.
      expect(cdnRequestCount).toHaveBeenCalledTimes(2);
    });
  });

  describe('with reporting enabled', () => {
    it('shares L2 cache across gateway instances', async () => {
      const cdnRequestCount = vi.fn();
      const sharedCache = createInMemoryCache();

      await using cdnServer = await createDisposableServer(
        createServerAdapter((req) => {
          if (req.url.endsWith('/apps/graphql-app/1.0.0/abc123')) {
            cdnRequestCount();
            return new Response(documentContent);
          }
          // Accept usage reports
          return new Response('OK');
        }),
      );

      await using upstreamServer = await createDisposableServer(
        createUpstreamServer(),
      );

      // First gateway instance with reporting
      await using gateway1 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        reporting: {
          type: 'hive',
          token,
          printTokenInfo: false,
          selfHosting: {
            graphqlEndpoint: cdnServer.url + '/graphql',
            applicationUrl: cdnServer.url,
            usageEndpoint: cdnServer.url,
          },
          agent: {
            sendInterval: 0,
          },
        },
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      await executeFetch(gateway1, { documentId });
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      await waitForCachePopulated(sharedCache);

      // Second gateway instance with reporting should use L2 cache
      await using gateway2 = createGatewayRuntime({
        proxy: {
          endpoint: `${upstreamServer.url}/graphql`,
        },
        cache: sharedCache,
        reporting: {
          type: 'hive',
          token,
          printTokenInfo: false,
          selfHosting: {
            graphqlEndpoint: cdnServer.url + '/graphql',
            applicationUrl: cdnServer.url,
            usageEndpoint: cdnServer.url,
          },
          agent: {
            sendInterval: 0,
          },
        },
        persistedDocuments: {
          type: 'hive',
          endpoint: cdnServer.url,
          token,
          cacheTtlSeconds: 3600,
        },
        logging: isDebug(),
      });

      await expect(executeFetch(gateway2, { documentId })).resolves.toEqual({
        data: { foo: 'bar' },
      });

      // L2 cache working: CDN called once. Not working: CDN called twice.
      expect(cdnRequestCount).toHaveBeenCalledTimes(1);

      await setTimeout(10); // allow hive client to flush
    });
  });
});
