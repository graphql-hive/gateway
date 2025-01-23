import { setTimeout } from 'timers/promises';
import type {
  GatewayConfigContext,
  GatewayGraphOSManagedFederationOptions,
} from '@graphql-hive/gateway';
import { Response } from '@whatwg-node/fetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGraphOSFetcher } from '../src/fetchers/graphos';

describe('GraphOS', () => {
  describe('supergraph fetching', () => {
    vi.useFakeTimers?.();
    const advanceTimersByTimeAsync = vi.advanceTimersByTimeAsync || setTimeout;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should fetch the supergraph SDL', async () => {
      const { unifiedGraphFetcher } = createTestFetcher({ fetch: mockSDL });

      const result = unifiedGraphFetcher({});
      await advanceTimersByTimeAsync(1_000);
      expect(await result).toBe(supergraphSdl);
    });

    it('should retry on error', async () => {
      let tries = 0;
      const { unifiedGraphFetcher } = createTestFetcher({
        fetch: () => (++tries === 1 ? mockFetchError() : mockSDL()),
      });

      const result = unifiedGraphFetcher({});
      for (let i = 0; i < 3; i++) {
        await advanceTimersByTimeAsync(1_000);
      }

      expect(await result).toBe(supergraphSdl);
    });

    it('should not retry more than maxRetry', async () => {
      const { unifiedGraphFetcher } = createTestFetcher(
        { fetch: mockFetchError },
        { maxRetries: 3 },
      );

      const result = unifiedGraphFetcher({});
      for (let i = 0; i < 3; i++) {
        await advanceTimersByTimeAsync(1_000);
      }
      await expect(result).rejects.toThrow();
      expect(mockFetchError).toHaveBeenCalledTimes(3);
    });

    it('should respect min-delay between retries', async () => {
      const { unifiedGraphFetcher } = createTestFetcher(
        { fetch: mockFetchError },
        { maxRetries: 3 },
      );

      const result = unifiedGraphFetcher({}).catch(() => {});
      await advanceTimersByTimeAsync(25);
      expect(mockFetchError).toHaveBeenCalledTimes(1);
      await advanceTimersByTimeAsync(50);
      expect(mockFetchError).toHaveBeenCalledTimes(1);
      await advanceTimersByTimeAsync(100);
      expect(mockFetchError).toHaveBeenCalledTimes(2);
      await advanceTimersByTimeAsync(100);
      expect(mockFetchError).toHaveBeenCalledTimes(3);
      await result;
    });

    it('should respect min-delay between polls', async () => {
      const { unifiedGraphFetcher } = createTestFetcher({ fetch: mockSDL });

      unifiedGraphFetcher({});
      await advanceTimersByTimeAsync(25);
      expect(mockSDL).toHaveBeenCalledTimes(1);
      await advanceTimersByTimeAsync(25);
      expect(mockSDL).toHaveBeenCalledTimes(1);
      unifiedGraphFetcher({});
      await advanceTimersByTimeAsync(50);
      expect(mockSDL).toHaveBeenCalledTimes(1);
      await advanceTimersByTimeAsync(50);
      expect(mockSDL).toHaveBeenCalledTimes(2);
    });

    it('should return the same supergraph schema if unchanged', async () => {
      let tries = 0;
      const { unifiedGraphFetcher } = createTestFetcher({
        fetch: () => (++tries === 1 ? mockSDL() : mockUnchanged()),
      });
      const result1 = unifiedGraphFetcher({});
      await advanceTimersByTimeAsync(1_000);
      const result2 = unifiedGraphFetcher({});
      await advanceTimersByTimeAsync(1_000);
      expect(await result1).toBe(await result2);
    });

    it('should not wait if min delay is superior to polling interval', async () => {
      const { unifiedGraphFetcher } = createTestFetcher({ fetch: mockSDL });
      const result = unifiedGraphFetcher({});
      await advanceTimersByTimeAsync(1_000);
      await result;
      const result2 = unifiedGraphFetcher({});
      await advanceTimersByTimeAsync(1_000);
      expect(await result).toBe(await result2);
    });
  });
});

function createTestFetcher(
  configContext: Partial<GatewayConfigContext> & {
    fetch: GatewayConfigContext['fetch'];
  },
  opts?: Partial<GatewayGraphOSManagedFederationOptions>,
) {
  return createGraphOSFetcher({
    configContext: {
      logger: {
        child() {
          return this;
        },
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: () => {},
        log: () => {},
      },
      cwd: process.cwd(),
      ...configContext,
    },
    graphosOpts: {
      apiKey: 'test-api-key',
      type: 'graphos',
      graphRef: 'test-graph-ref',
      ...opts,
    },
  });
}

let supergraphSdl = 'TEST SDL';
const mockSDL = vi.fn(() =>
  Response.json({
    data: {
      routerConfig: {
        __typename: 'RouterConfigResult',
        minDelaySeconds: 0.1,
        id: 'test-id-1',
        supergraphSdl,
        messages: [],
      },
    },
  }),
);

const mockUnchanged = vi.fn(() =>
  Response.json({
    data: {
      routerConfig: {
        __typename: 'Unchanged',
        minDelaySeconds: 0.1,
        id: 'test-id-1',
      },
    },
  }),
);

const mockFetchError = vi.fn(() =>
  Response.json({
    data: {
      routerConfig: {
        __typename: 'FetchError',
        code: 'FETCH_ERROR',
        message: 'Test error message',
        minDelaySeconds: 0.1,
      },
    },
  }),
);
