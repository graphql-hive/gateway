import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  // RAW_FORWARD=0 turns the option off, which lets the benchmark compare both
  // modes. Anything else keeps it on.
  __experimental__rawForward: process.env['RAW_FORWARD'] !== '0',
});
