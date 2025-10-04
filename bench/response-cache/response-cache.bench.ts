import { createExampleSetup, createTenv } from '@internal/e2e';
import { benchConfig } from '@internal/testing';
import { bench, describe, expect } from 'vitest';

describe('Response Cache', async () => {
  const { gateway, container } = createTenv(__dirname);
  const exampleSetup = createExampleSetup(__dirname, 1000);

  const redis = await container({
    name: 'redis',
    healthcheck: ['CMD', 'redis-cli', 'ping'],
    env: {
      LANG: '',
      LC_ALL: '',
    },
    image: 'redis',
    containerPort: 6379,
  });

  const supergraph = await exampleSetup.supergraph();

  const { query, operationName, result } = exampleSetup;

  const gatewayWithoutCache = await gateway({
    supergraph,
    args: ['-c', 'gateway-without-cache.config.ts'],
  });
  bench(
    'Without response cache',
    async () => {
      const response = await gatewayWithoutCache.execute({
        query,
        operationName,
      });
      expect(response).toEqual(result);
    },
    benchConfig,
  );

  const gatewayWithCache = await gateway({
    supergraph,
    args: ['-c', 'gateway-with-cache.config.ts'],
  });
  bench(
    'With in memory response cache',
    async () => {
      const response = await gatewayWithCache.execute({
        query,
        operationName,
      });
      expect(response).toEqual(result);
    },
    benchConfig,
  );

  const gatewayWithRedisCache = await gateway({
    supergraph,
    args: ['-c', 'gateway-with-redis.config.ts'],
    env: {
      REDIS_URL: `redis://localhost:${redis.port}`,
    },
  });
  bench(
    'With redis response cache',
    async () => {
      const response = await gatewayWithRedisCache.execute({
        query,
        operationName,
      });
      expect(response).toEqual(result);
    },
    benchConfig,
  );
});
