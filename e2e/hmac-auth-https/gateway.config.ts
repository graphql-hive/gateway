import {
  createInlineSigningKeyProvider,
  defineConfig,
} from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  hmacSignature: {
    secret: 'HMAC_SIGNING_SECRET',
  },
  jwt: {
    forward: {
      payload: true,
      token: false,
    },
    signingKeyProviders: [createInlineSigningKeyProvider('JWT_SIGNING_SECRET')],
    reject: {
      missingToken: false,
      invalidToken: false,
    },
  },
});
