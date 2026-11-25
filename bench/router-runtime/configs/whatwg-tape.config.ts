import { defineConfig } from '@graphql-hive/gateway';
import { fetch } from '@whatwg-node/fetch';

// like `tape`, with `@whatwg-node/fetch` for subgraph requests, the gateway's fetch before undici's
process.env['HIVE_ROUTER_RUNTIME_RESPONSE_TAPE'] = '1';

export const gatewayConfig = defineConfig({ fetchAPI: { fetch } });
