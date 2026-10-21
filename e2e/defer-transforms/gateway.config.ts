import { defineConfig } from '@graphql-hive/gateway';

/**
 * Forward client `@defer` through mesh transforms to the catalog subgraph.
 * Transforms (prefix / hoist / rename) rewrite the operation; IncrementalReceiver
 * must still merge patches into the gateway field shapes.
 *
 * Gateway-owned `@defer` + transforms is covered in stitch unit tests (local /
 * mergeable subschemas). A pure HTTP mesh subgraph has no local resolvers to
 * re-resolve omitted deferred fields, so this e2e stays on the forward path.
 */
export const gatewayConfig = defineConfig({
  deferStream: {
    subgraph: true,
  },
});
