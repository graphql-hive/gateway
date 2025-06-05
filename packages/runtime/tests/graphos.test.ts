import { setTimeout } from 'timers/promises';
import {
  type GatewayConfigContext,
  type GatewayGraphOSManagedFederationOptions,
} from '@graphql-hive/gateway-runtime';
import { LegacyLogger, Logger } from '@graphql-hive/logger';
import { TransportContext } from '@graphql-mesh/transport-common';
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

      const result = Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(1_000);
      expect(await result).toBe(supergraphSdl);
    });

    it('should retry on error', async () => {
      let tries = 0;
      const { unifiedGraphFetcher } = createTestFetcher({
        fetch: () => {
          tries++;
          if (tries === 1) {
            return mockFetchError();
          }
          return mockSDL();
        },
      });

      const result = Promise.resolve().then(() => unifiedGraphFetcher());
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

      const result = Promise.resolve()
        .then(() => unifiedGraphFetcher())
        .catch((err) => err);
      for (let i = 0; i < 3; i++) {
        await advanceTimersByTimeAsync(1_000);
      }
      expect(await result).toBeInstanceOf(Error);
      expect(mockFetchError).toHaveBeenCalledTimes(3);
    });

    it('should respect min-delay between retries', async () => {
      const { unifiedGraphFetcher } = createTestFetcher(
        { fetch: mockFetchError },
        { maxRetries: 3 },
      );

      const result = Promise.resolve()
        .then(() => unifiedGraphFetcher())
        .catch(() => {});
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

      Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(25);
      expect(mockSDL).toHaveBeenCalledTimes(1);
      await advanceTimersByTimeAsync(20);
      expect(mockSDL).toHaveBeenCalledTimes(1);
      Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(50);
      expect(mockSDL).toHaveBeenCalledTimes(1);
      await advanceTimersByTimeAsync(50);
      expect(mockSDL).toHaveBeenCalledTimes(2);
    });

    it('should return the same supergraph schema if unchanged', async () => {
      let tries = 0;
      const { unifiedGraphFetcher } = createTestFetcher({
        fetch: () => {
          tries++;
          if (tries === 1) {
            return mockUnchanged();
          }
          return mockSDL();
        },
      });
      const result1 = Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(1_000);
      const result2 = Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(1_000);
      expect(await result1).toBe(await result2);
    }, 30_000);

    it('should not wait if min delay is superior to polling interval', async () => {
      const { unifiedGraphFetcher } = createTestFetcher({ fetch: mockSDL });
      const result = Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(1_000);
      await result;
      const result2 = Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(1_000);
      expect(await result).toBe(await result2);
    });

    it('should respect `lastSeenId` even if the SDL is changed', async () => {
      let tries = 0;
      const { unifiedGraphFetcher } = createTestFetcher({
        fetch: () => {
          tries++;
          if (tries === 1) {
            return mockSDL();
          }
          return Response.json({
            data: {
              routerConfig: {
                __typename: 'RouterConfigResult',
                minDelaySeconds: 0.1,
                id: 'test-id-1',
                supergraphSdl: 'NOT SAME SDL',
                messages: [],
              },
            },
          });
        },
      });

      const result = Promise.resolve().then(() => unifiedGraphFetcher());
      await advanceTimersByTimeAsync(1_000);
      const result2 = Promise.resolve().then(() => unifiedGraphFetcher());
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
  const log = new Logger({ level: process.env['DEBUG'] ? 'debug' : false });
  const fetcher = createGraphOSFetcher({
    configContext: {
      log,
      cwd: process.cwd(),
      ...configContext,
    },
    graphosOpts: {
      apiKey: 'test-api-key',
      type: 'graphos',
      graphRef: 'test-graph-ref',
      ...opts,
    },
    pollingInterval: 0.000000001,
  });
  return {
    unifiedGraphFetcher: (transportContext: Partial<TransportContext> = {}) => {
      return fetcher.unifiedGraphFetcher({
        log,
        logger: LegacyLogger.from(log),
        ...transportContext,
      });
    },
  };
}

let supergraphSdl = 'TEST SDL';
const mockSDL = vi.fn(async () =>
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

const mockUnchanged = vi.fn(async () =>
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

const mockFetchError = vi.fn(async () =>
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
