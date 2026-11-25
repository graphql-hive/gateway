import { defineConfig } from '@graphql-hive/gateway';

// experimental: the Hive Router runtime keeps the data as the subgraphs' response bytes and
// writes the response straight from them, for the plans it supports
process.env['HIVE_ROUTER_RUNTIME_RESPONSE_TAPE'] = '1';

export const gatewayConfig = defineConfig({});
