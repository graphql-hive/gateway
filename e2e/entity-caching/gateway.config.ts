import { defineConfig } from '@graphql-hive/gateway';
import InmemoryLRUCache from '@graphql-mesh/cache-inmemory-lru';

export const gatewayConfig = defineConfig({
  cache: new InmemoryLRUCache(),
  responseCaching: {
    session: () => null,
    // sets the result.extensions.responseCache object in the response,
    // which is used in tests to assert caching behavior
    includeExtensionMetadata: true,
  },
});
