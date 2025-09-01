import { getHeadersObj } from '@graphql-mesh/utils';
import { GatewayConfigContext, GatewayPlugin } from '../types';

export interface ConfigInServerContextOptions {
  configContext: GatewayConfigContext;
}

export function useConfigInServerContext({
  configContext,
}: ConfigInServerContextOptions): GatewayPlugin {
  return {
    onRequest({ serverContext, request }) {
      // we want to inject the GatewayConfigContext to the server context to
      // have it available always through the plugin system
      Object.assign(serverContext, {
        ...configContext,
        headers: getHeadersObj(request.headers),
      });
    },
  };
}
