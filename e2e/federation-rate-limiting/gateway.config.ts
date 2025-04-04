import { defineConfig } from '@graphql-hive/gateway';

const rateLimitTtl = parseInt(process.env['RATE_LIMIT_TTL'] || '');
if (isNaN(rateLimitTtl)) {
  throw new Error('RATE_LIMIT_TTL must be a number');
}

export const gatewayConfig = defineConfig({
  rateLimiting: [
    {
      type: 'Query',
      field: 'users',
      max: 5,
      ttl: rateLimitTtl,
      identifier: 'anonymous',
    },
  ],
});
