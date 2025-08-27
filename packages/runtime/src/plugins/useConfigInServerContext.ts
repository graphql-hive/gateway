import { getHeadersObj } from '@graphql-mesh/utils';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import { GatewayConfigContext, GatewayPlugin } from '../types';

export interface ConfigInServerContextOptions {
  configContext: GatewayConfigContext;
  /** We use the "ref" pattern because the contextBuilder can be asynchronously set by createGatewayRuntime. */
  contextBuilderRef: { ref: (<T>(context: T) => MaybePromise<T>) | null };
}

export function useConfigInServerContext({
  configContext,
  contextBuilderRef,
}: ConfigInServerContextOptions): GatewayPlugin {
  return {
    onRequest({ serverContext, request }) {
      const {
        // @ts-expect-error might be present, or not?
        req,
      } = serverContext;

      let headers = // Maybe Node-like environment
        req?.headers
          ? getHeadersObj(req.headers)
          : // Fetch environment
            // TODO: request should always be present
            request?.headers
            ? getHeadersObj(request.headers)
            : // Unknown environment
              {};

      const baseContext = { ...configContext, headers };

      // NOTE: connectionParams wont ever be set in onRequest, the hook wont even be called probably
      //       adding connectionParams to the headers is done in the context factory in yoga
      // if (serverContext.connectionParams) {
      //   const headers = {
      //     ...baseContext.headers,
      //     ...connectionParams,
      //   };
      //   baseContext.headers = headers;
      //   baseContext.connectionParams = headers;
      // }

      return handleMaybePromise(
        () => contextBuilderRef.ref?.(baseContext) ?? baseContext,
        (context) => {
          // we want to inject the GatewayConfigContext to the server context to
          // have it available always through the plugin system
          Object.assign(serverContext, context);
        },
      );
    },
  };
}
