import { defineConfig, GatewayContext } from '@graphql-hive/gateway';

const labelServiceUrl = process.env['LABEL_SERVICE_URL'];

if (!labelServiceUrl) {
  throw new Error('LABEL_SERVICE_URL environment variable is not defined');
}

export const gatewayConfig = defineConfig({
  async progressiveOverride(label, context: GatewayContext) {
    if (label === 'use_inventory_service') {
      const serviceRes = await fetch(labelServiceUrl, {
        headers: {
          'x-use-inventory-service':
            context.headers['x-use-inventory-service'] || 'false',
        },
      }).then((res) => res.text());
      return serviceRes === 'use_inventory_service';
    }
    return false;
  },
});
