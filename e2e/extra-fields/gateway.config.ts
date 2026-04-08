import { defineConfig } from '@graphql-hive/gateway';
import { additionalTypeDefs } from './additionalTypeDefs';

const additionalTypeDefsIn = process.env['ADDITIONAL_TYPE_DEFS_IN'];

export const gatewayConfig = defineConfig({
  additionalTypeDefs:
    additionalTypeDefsIn === 'both' || additionalTypeDefsIn === 'gateway'
      ? additionalTypeDefs
      : undefined,
});
