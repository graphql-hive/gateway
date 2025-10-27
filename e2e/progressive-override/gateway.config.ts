import { defineConfig, GatewayContext } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  progressiveOverride(label, context: GatewayContext) {
    if (
      label === 'use_inventory_service' &&
      context.request.headers.get('x-use-inventory-service') === 'true'
    ) {
      return true;
    }
    return false;
  },
});
