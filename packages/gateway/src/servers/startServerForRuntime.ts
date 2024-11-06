import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import { getTerminateStack, mapMaybePromise } from '@graphql-mesh/utils';
import { defaultOptions } from '../cli';
import { startBunServer } from './bun';
import { startNodeHttpServer } from './nodeHttp';
import { ServerForRuntimeOptions } from './types';
import { MaybePromise } from '@graphql-tools/utils';

export function startServerForRuntime<
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
): MaybePromise<AsyncDisposable> {
  const terminateStack = getTerminateStack();
  terminateStack.use(runtime);
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

  const startServer = globalThis.Bun ? startBunServer : startNodeHttpServer;
  
  return mapMaybePromise(startServer(runtime, serverOpts), server => {
    terminateStack.use(server);
    return server;
  });
}