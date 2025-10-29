import { defineConfig, GatewayContext } from '@graphql-hive/gateway';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const labelServicePort = opts.getServicePort('label', true);

export const gatewayConfig = defineConfig({
  async progressiveOverride(label, context: GatewayContext) {
    if (label === 'use_inventory_service') {
      const serviceRes = await fetch(`http://localhost:${labelServicePort}/`, {
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
