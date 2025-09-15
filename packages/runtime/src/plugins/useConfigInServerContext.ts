import { getHeadersObj } from '@graphql-mesh/utils';
import { ServerAdapterPlugin } from '@whatwg-node/server';
import { GatewayConfigContext, GatewayPlugin } from '../types';

export interface ConfigInServerContextOptions {
  configContext: GatewayConfigContext;
}

export function useConfigInServerContext({
  configContext,
}: ConfigInServerContextOptions): GatewayPlugin {
  const configInServerContextPlugin: ServerAdapterPlugin = {
    onRequest({ serverContext, request }) {
      // we want to inject the GatewayConfigContext to the server context to
      // have it available always through the plugin system
      Object.assign(serverContext, configContext, {
        // @ts-expect-error - We know sometimes req is there
        headers: serverContext.req?.headers || getHeadersObj(request.headers),
      });
    },
  };
  return {
    onPluginInit({ plugins }) {
      if (!plugins.includes(configInServerContextPlugin)) {
        // we unshift because we want this plugin to run first before all other
        // this is because some routes, like graphiql, readiness and healtcheck
        // use onRequest's endResponse to short-circuit the request and therefore
        // not running this plugin at all
        plugins.unshift(configInServerContextPlugin);
      }
    },
  };
}
