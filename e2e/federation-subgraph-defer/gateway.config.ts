import { defineConfig } from '@graphql-hive/gateway';

/**
 * Enable client @defer/@stream and forward `@defer` to subgraphs that support
 * incremental delivery. See federation-subgraph-defer.e2e.ts.
 *
 * `deferStream: true` alone keeps the gateway-owned path (omit + refetch).
 */
export const gatewayConfig = defineConfig({
  deferStream: {
    subgraph: true,
  },
});
