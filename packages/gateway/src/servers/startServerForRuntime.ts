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
      startServer = createUWSStartFn(uws);
    } catch (error) {
      log.warn(
        'uWebSockets.js is not available, falling back to Node.js HTTP server.',
      );
      startServer = startNodeHttpServer;
    }
  }

  return startServer<TContext>(runtime, serverOpts);
}
