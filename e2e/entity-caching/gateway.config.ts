import { defineConfig } from '@graphql-hive/gateway';
import InmemoryLRUCache from '@graphql-mesh/cache-inmemory-lru';

export const gatewayConfig = defineConfig({
  cache: new InmemoryLRUCache(),
  responseCaching: {
    session: () => null,
    includeExtensionMetadata: true,
  },
});
