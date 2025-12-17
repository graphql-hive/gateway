import { defineConfig } from '@graphql-hive/gateway';
import { getEnvStr } from '@internal/testing';

const store: { [sha256Hash: string]: string } = {
  '5d112fb0e85c9e113301e9354c39f36b2ee41d82': '{__typename}',
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
