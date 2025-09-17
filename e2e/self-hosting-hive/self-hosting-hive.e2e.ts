import { setTimeout } from 'node:timers/promises';
import {
  createExampleSetup,
  createTenv,
  handleDockerHostNameInURLOrAtPath,
} from '@internal/e2e';
import { isCI } from '~internal/env';
import { describe, expect, it } from 'vitest';

const { gateway, service, gatewayRunner } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);

describe('Self Hosting Hive', () => {
  const TEST_TOKEN = 'my-token';
  const TEST_KEY = 'my-key';
  it('usage', async () => {
    const supergraphPath = await supergraph();
    if (gatewayRunner.includes('docker')) {
      await handleDockerHostNameInURLOrAtPath(supergraphPath, []);
    }
    const selfHostingHive = await service('selfHostingHive', {
      env: {
        SUPERGRAPH_PATH: supergraphPath,
      },
    });
    const HIVE_URL = `http://${
      gatewayRunner.includes('docker')
        ? isCI()
          ? '172.17.0.1'
          : 'host.docker.internal'
        : 'localhost'
    }:${selfHostingHive.port}`;
    const gw = await gateway({
      supergraph: `${HIVE_URL}/supergraph`,
      services: [selfHostingHive],
      args: [
        `--hive-registry-token=${TEST_TOKEN}`,
        `--hive-cdn-key=${TEST_KEY}`,
      ],
      env: {
        HIVE_URL,
      },
    });
    await expect(
      gw.execute({
        query,
      }),
    ).resolves.toEqual(result);
    await setTimeout(300);
    const incomingData = selfHostingHive.getStd('out');
    // Check if `/supergraph` endpoint receives the GET request
    expect(incomingData).toContain('GET /supergraph');
    expect(incomingData).toContain(`"x-hive-cdn-key":"${TEST_KEY}"`);
    // Check if `/usage` endpoint receives the POST request
    expect(incomingData).toContain('POST /usage');
    expect(incomingData).toContain(`"authorization":"Bearer ${TEST_TOKEN}"`);
    // Check if appropriate logs
    const gwLogs = gw.getStd('out');
    expect(gwLogs).toMatch(
      /\[hiveSupergraphFetcher\] GET .* succeeded with status 200/,
    );
    expect(gwLogs).toMatch(
      /\[useHiveConsole\] \[hive\]\[usage\] POST .* succeeded with status 200/,
    );
  });
});
