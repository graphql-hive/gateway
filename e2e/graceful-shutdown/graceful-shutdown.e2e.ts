import { setTimeout } from 'timers/promises';
import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-ws';
import { expect, it } from 'vitest';
import WebSocket from 'ws';

const { gateway, service, gatewayRunner } = createTenv(__dirname);

it
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
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
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
  )
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
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
  )
  .each(['SIGINT', 'SIGTERM'] as const)(
  'should reject healthcheck and readiness probes during drain on %s',
  async (signal) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      // long enough drain window so the server is still up when we probe
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: 1_000 },
    });

    const healthcheckUrl = `http://0.0.0.0:${gw.port}/healthcheck`;
    const readinessUrl = `http://0.0.0.0:${gw.port}/readiness`;

    // confirm probes pass before shutdown
    await expect(fetch(healthcheckUrl)).resolves.toHaveProperty('status', 200);
    await expect(fetch(readinessUrl)).resolves.toHaveProperty('status', 200);

    // keep a slow request in-flight so the server stays in the drain window
    gw.execute({ query: '{slowHello}' });
    await setTimeout(50);
    gw.kill(signal);
    // give server.close() a moment to take effect
    await setTimeout(50);

    // server no longer accepts new connections - both probes must fail
    await expect(fetch(healthcheckUrl)).rejects.toThrow();
    await expect(fetch(readinessUrl)).rejects.toThrow();

    await gw.waitForExit;
  },
);

it
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
  )
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

it
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
  )
  .each(['SIGINT', 'SIGTERM'] as const)(
  'should close live WebSocket subscriptions with 1001 on %s',
  async (signal) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: 1_000 },
    });

    const subscribers = await Promise.all(
      [1, 2, 3].map(() => subscribeOverWS(gw.port)),
    );

    gw.kill(signal);

    for (const { closed } of subscribers) {
      await expect(closed).resolves.toEqual({
        code: 1001,
        reason: 'Going away',
      });
    }

    await gw.waitForExit;
  },
);

it
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
  )
  .each(['SIGINT', 'SIGTERM'] as const)(
  'should exit promptly with live WebSocket subscriptions on %s',
  async (signal) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: 1_000 },
    });

    await subscribeOverWS(gw.port);

    gw.kill(signal);

    await expect(
      Promise.race([
        gw.waitForExit,
        setTimeout(1_000).then(() =>
          Promise.reject(new Error('Gateway did not exit after drain')),
        ),
      ]),
    ).resolves.toBeUndefined();
  },
);

it
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
  )
  .each(['SIGINT', 'SIGTERM'] as const)(
  'should close live WebSocket subscriptions with 1001 without a drain window on %s',
  async (signal) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: 0 },
    });

    const { closed } = await subscribeOverWS(gw.port);

    gw.kill(signal);

    await expect(closed).resolves.toEqual({
      code: 1001,
      reason: 'Going away',
    });

    await gw.waitForExit;
  },
);

it
  .skipIf(
    // "cannot send signals to containers" from dockerode - tenv limitation
    gatewayRunner.includes('docker'),
  )
  .each([
    ['SIGINT', 1_000],
    ['SIGTERM', 1_000],
    ['SIGINT', 0],
    ['SIGTERM', 0],
  ] as const)(
  'should force-close WebSocket clients that never answer the close handshake on %s with a %dms drain window',
  async (signal, gracefulShutdownTimeout) => {
    const slowSvc = await service('slow');
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [slowSvc],
      },
      env: { GRACEFUL_SHUTDOWN_TIMEOUT: gracefulShutdownTimeout },
    });

    const socket = await connectOverWS(gw.port);
    socket.pause();

    const start = Date.now();
    gw.kill(signal);
    await gw.waitForExit;

    expect(Date.now() - start).toBeLessThan(3_000);
  },
);

interface SocketClose {
  code: number;
  reason: string;
}

/** Opens a `graphql-ws` subscription that is live once this resolves. */
async function subscribeOverWS(port: number) {
  let onClose: (close: SocketClose) => void;
  const closed = new Promise<SocketClose>((resolve) => {
    onClose = resolve;
  });
  const client = createClient({
    url: `ws://0.0.0.0:${port}/graphql`,
    webSocketImpl: WebSocket,
    retryAttempts: 0,
    on: {
      closed: (event) => {
        const { code, reason } = event as SocketClose;
        onClose({ code, reason });
      },
    },
  });

  const subscription = client.iterate({
    query: 'subscription{emitsOnceAndStalls}',
  });
  await expect(subscription.next()).resolves.toHaveProperty(
    'value.data.emitsOnceAndStalls',
    'world',
  );

  return { closed };
}

/** Opens a raw `graphql-transport-ws` connection and resolves once acknowledged. */
async function connectOverWS(port: number) {
  const socket = new WebSocket(
    `ws://0.0.0.0:${port}/graphql`,
    'graphql-transport-ws',
  );
  await new Promise((resolve) => socket.once('open', resolve));
  socket.send(JSON.stringify({ type: 'connection_init' }));
  const [ack] = await new Promise<[string]>((resolve) =>
    socket.once('message', (data) => resolve([String(data)])),
  );
  expect(JSON.parse(ack)).toHaveProperty('type', 'connection_ack');
  return socket;
}
