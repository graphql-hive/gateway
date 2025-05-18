import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import { defaultOptions } from '../cli';
import { startBunServer } from './bun';
import { startNodeHttpServer } from './nodeHttp';
import { ServerForRuntimeOptions } from './types';
import { createUWSStartFn } from './uws';

export async function startServerForRuntime<
  TContext extends Record<string, any> = Record<string, any>,
>(
  runtime: GatewayRuntime<TContext>,
  {
    log,
    host = defaultOptions.host,
    port = defaultOptions.port,
    sslCredentials,
    maxHeaderSize = 16_384,
    disableWebsockets = false,
  }: ServerForRuntimeOptions,
): Promise<void> {
  process.on('message', (message) => {
    if (message === 'invalidateUnifiedGraph') {
      log.info(`Invalidating Supergraph`);
      runtime.invalidateUnifiedGraph();
    }
  });

  const serverOpts: ServerForRuntimeOptions = {
    log,
    host,
    port,
    maxHeaderSize,
    disableWebsockets,
    ...(sslCredentials ? { sslCredentials } : {}),
  };

  let startServer;

  if (globalThis.Bun) {
    startServer = startBunServer;
  } else {
    try {
      const uws = await import('uWebSockets.js');
      log.info('uWebSockets.js is available, using it for the server');
      startServer = createUWSStartFn(uws);
    } catch {
      startServer = startNodeHttpServer;
    }
  }

  return startServer(runtime, serverOpts);
}
