import { defineConfig } from '@graphql-hive/gateway';

/**
 * Forward client `@defer` through mesh transforms to the catalog subgraph.
 * Transforms (prefix / hoist / rename) rewrite the operation; IncrementalReceiver
 * must still merge patches into the gateway field shapes.
 */
export const gatewayConfig = defineConfig({
  deferStream: {
    subgraph: true,
  },
});
