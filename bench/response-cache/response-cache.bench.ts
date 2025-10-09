import { setTimeout } from 'node:timers/promises';
import { createExampleSetup, createTenv, GatewayOptions } from '@internal/e2e';
import { benchConfig } from '@internal/testing';
import { bench, describe, expect } from 'vitest';

describe('Response Cache', async () => {
  const { runBench, container } = await makeRunner();
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

  await runBench(
    'With in memory response cache',
    'gateway-with-cache.config.ts',
  );
  await runBench('Without response cache', 'gateway-without-cache.config.ts');

  await runBench.skip(
    'Without invalidation cache',
    'gateway-without-auto-invalidation.config.ts',
  );

  await runBench.skip(
    'With redis response cache',
    'gateway-with-redis.config.ts',
    {
      env: {
        REDIS_URL: `redis://localhost:${redis.port}`,
      },
    },
  );
});

const makeRunner = async () => {
  const { gateway, container } = createTenv(__dirname);
  const exampleSetup = createExampleSetup(__dirname, 1000);

  const supergraph = await exampleSetup.supergraph();

  const { query, operationName, result } = exampleSetup;

  const runBench = async (
    name: string,
    configFile: string,
    options?: Partial<GatewayOptions>,
  ) => {
    const { execute } = await gateway({
      supergraph,
      ...options,
      args: ['-c', configFile, ...(options?.args ?? [])],
    });
    return bench(
      name,
      async () => {
        const response = await execute({
          query,
          operationName,
        });
        expect(response).toEqual(result);
      },
      benchConfig,
    );
  };

  runBench.skip = async (
    name: string,
    _configFile: string,
    _options?: GatewayOptions,
  ) => bench.skip(name);

  return {
    runBench,
    container,
  };
};
