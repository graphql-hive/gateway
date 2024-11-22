import { defineConfig } from '@graphql-hive/gateway';
import { fakePromise } from '@graphql-tools/utils';

// top level await
await fakePromise(undefined);

export const gatewayConfig = defineConfig({});
