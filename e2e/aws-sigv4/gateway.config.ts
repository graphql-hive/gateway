import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  awsSigv4: {
    region: 'us-east-1',
    serviceName: 'lambda',
  },
});
