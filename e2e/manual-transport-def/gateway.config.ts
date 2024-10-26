import { defineConfig } from '@graphql-hive/gateway';
import rest from '@graphql-mesh/transport-rest';

export const gatewayConfig = defineConfig({
  transports: {
    rest,
    http: import('@graphql-mesh/transport-http'),
  },
});
