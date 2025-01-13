import { setTimeout } from 'node:timers/promises';
import { DisposableSymbols } from '@graphql-hive/gateway';
import { createExampleSetup, createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Self Hosting Hive', () => {
  const TEST_TOKEN = 'my-token';
  const { gateway, service } = createTenv(__dirname);
  const { supergraph, query, result } = createExampleSetup(__dirname);
  it('usage', async () => {
    const selfHostingHive = await service('selfHostingHive');
    await using gw = await gateway({
      supergraph: await supergraph(),
      services: [selfHostingHive],
      args: [`--hive-registry-token=${TEST_TOKEN}`],
    });
    await expect(
      gw.execute({
        query,
      }),
    ).resolves.toEqual(result);
    await gw[DisposableSymbols.asyncDispose]();
    const incomingData = selfHostingHive.getStd('out');
    // Check if `/usage` endpoint receives the POST request
    expect(incomingData).toContain('POST /usage');
    expect(incomingData).toContain(`"authorization":"Bearer ${TEST_TOKEN}"`);
  });
});
