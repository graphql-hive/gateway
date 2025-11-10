import {
  createInlineSigningKeyProvider,
  defineConfig,
  JWTAuthContextExtension,
} from '@graphql-hive/gateway';
import { JWT_SECRET } from './env';

export const gatewayConfig = defineConfig<JWTAuthContextExtension>({
  jwt: {
    signingKeyProviders: [createInlineSigningKeyProvider(JWT_SECRET)],
  },
  genericAuth: {
    mode: 'protect-granular',
    resolveUserFn: (ctx) => ctx.jwt?.payload,
  },
});
