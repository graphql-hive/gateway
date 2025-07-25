import { defineConfig } from '@graphql-hive/gateway';
import { getEnvStr } from '@internal/testing';

const store: { [sha256Hash: string]: string } = {
  typename: '{__typename}',
};

export const gatewayConfig = defineConfig({
  reporting: {
    type: 'hive',
    token: 'great-token',
    agent: {
      maxRetries: 0,
      maxSize: 1,
      timeout: 200,
    },
    selfHosting: {
      applicationUrl: `${getEnvStr('HIVE_URL')}`,
      graphqlEndpoint: `${getEnvStr('HIVE_URL')}/graphql`,
      usageEndpoint: `${getEnvStr('HIVE_URL')}/usage`,
    },
  },
  persistedDocuments: {
    getPersistedOperation(sha256Hash) {
      return store[sha256Hash] || null;
    },
  },
});
