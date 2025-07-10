import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  propagateHeaders: {
    fromClientToSubgraphs({ request, subgraphName }) {
      if (subgraphName !== 'upstream') {
        return;
      }

      return {
        authorization: request.headers.get('authorization') ?? 'default',
        'session-cookie-id':
          request.headers.get('session-cookie-id') ?? 'default',
      };
    },
  },
});
