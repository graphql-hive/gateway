import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import type { MaybePromise } from '@graphql-tools/utils';
import { defaultOptions } from '../cli';
import { ServerForRuntimeOptions } from './types';

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
): MaybePromise<void> {
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

  if (globalThis.Bun) {
    return import('./bun').then(({ startBunServer }) => startBunServer(runtime, serverOpts));
  }
  return import('./nodeHttp').then(({ startNodeHttpServer }) => startNodeHttpServer(runtime, serverOpts));
}
