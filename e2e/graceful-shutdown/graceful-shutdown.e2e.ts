import os from 'os';
import { setTimeout } from 'timers/promises';
import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service, gatewayRunner } = createTenv(__dirname);

it
  .skipIf(
    // whatever's happening on windows
    os.platform().toLowerCase() === 'win32',
  )
  .each(['SIGINT', 'SIGTERM'] as const)(
  'should let in-flight requests complete before exiting on %s',
  async (signal) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: 1_000 },
    });

    // fire a slow request (300ms) but don't await it yet
    const slowRequest = gw.execute({ query: '{slowHello}' });

    // give the request a moment to reach the gateway before sending the signal
    await setTimeout(50);

    gw.kill(signal);

    // the in-flight request must complete successfully despite the signal
    await expect(slowRequest).resolves.toEqual({
      data: { slowHello: 'world' },
    });

    // after the last request finished the server must close and the process must exit cleanly
    await expect(
      Promise.race([
        gw.waitForExit,
        setTimeout(2_000).then(() =>
          Promise.reject(new Error('Gateway did not exit after drain')),
        ),
      ]),
    ).resolves.toBeUndefined();
  },
);

it
  .skipIf(gatewayRunner.includes('docker'))
  .each(['SIGINT', 'SIGTERM'] as const)(
  'should exit promptly when no requests are in-flight on %s',
  async (signal) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: 1_000 },
    });

    // one successful request to confirm the gateway is working
    await expect(gw.execute({ query: '{slowHello}' })).resolves.toEqual({
      data: { slowHello: 'world' },
    });

    gw.kill(signal);

    // with no in-flight requests the gateway should stop quickly (well within the 1s gracefulShutdownTimeout)
    await expect(
      Promise.race([
        gw.waitForExit,
        setTimeout(500).then(() =>
          Promise.reject(new Error('Gateway did not exit after drain')),
        ),
      ]),
    ).resolves.toBeUndefined();
  },
);

it
  .skipIf(gatewayRunner.includes('docker'))
  .each(['SIGINT', 'SIGTERM'] as const)(
  'should forcefully close connections after gracefulShutdownTimeout on %s',
  async (signal) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      // 100ms timeout so the fuse fires well before slowHello (300ms) completes
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: 100 },
    });

    // fire a slow request (300ms) - it will never finish within the 100ms drain window
    const slowRequest = gw.execute({ query: '{slowHello}' });

    // give the request a moment to reach the gateway before sending the signal
    await setTimeout(50);

    gw.kill(signal);

    // the request must be cut off (connection error), not hang until slowHello resolves
    await expect(slowRequest).rejects.toThrow();

    // the process must exit promptly after the fuse fires (100ms timeout + some leeway)
    await expect(
      Promise.race([
        gw.waitForExit,
        setTimeout(2_000).then(() =>
          Promise.reject(
            new Error('Gateway did not exit after forceful shutdown'),
          ),
        ),
      ]),
    ).resolves.toBeUndefined();
  },
);
