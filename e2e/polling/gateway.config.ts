import fs from 'fs';
import { defineConfig } from '@graphql-hive/gateway';

const SUPERGRAPH_PATH = process.env['SUPERGRAPH_PATH'] || 'supergraph.graphql';

export const gatewayConfig = defineConfig({
  supergraph: async (): Promise<string> => {
    console.log(`[${new Date().toISOString()}]`, 'Reading ' + SUPERGRAPH_PATH);
    return fs.promises.readFile(SUPERGRAPH_PATH, 'utf8');
  },
  pollingInterval: 5_000,
});