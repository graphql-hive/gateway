import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import { MaybePromise } from '@graphql-tools/utils';
import { defaultOptions } from '../cli';
import { startBunServer } from './bun';
import { startNodeHttpServer } from './nodeHttp';
import { ServerForRuntimeOptions } from './types';

export function startServerForRuntime<
  TContext extends Record<string, any> = Record<string, any>,
>(
  runtime: GatewayRuntime<TContext>,
  opts: ServerForRuntimeOptions,
): MaybePromise<void> {
  process.on('message', (message) => {
    if (message === 'invalidateUnifiedGraph') {
      opts.log.info('Invalidating Supergraph');
      runtime.invalidateUnifiedGraph();
    }
  });

  const startServer = globalThis.Bun ? startBunServer : startNodeHttpServer;

  return startServer(runtime, {
    host: defaultOptions.host,
    port: defaultOptions.port,
    maxHeaderSize: 16_384,
    disableWebsockets: false,
    ...opts,
  });
}
