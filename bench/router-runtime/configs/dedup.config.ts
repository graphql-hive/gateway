import { defineConfig } from '@graphql-hive/gateway';

// the gateway's defaults: identical subgraph requests in flight at the same time are sent once,
// so with every virtual user sending the same operation most subgraph responses are shared
export const gatewayConfig = defineConfig({});
