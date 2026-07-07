import { defineConfig } from '@graphql-hive/gateway';
import { GraphQLError } from 'graphql';

const hiveUrl = process.env['HIVE_URL']!;
const overWs = process.env['OVER_WS'] === 'true';
const genericAuth = process.env['GENERIC_AUTH'] === 'true';

export const gatewayConfig = defineConfig({
  reporting: {
    type: 'hive',
    debug: true,
    agent: {
      maxRetries: 1,
      maxSize: 1,
      timeout: 200,
    },
    selfHosting: {
      applicationUrl: hiveUrl,
      graphqlEndpoint: `${hiveUrl}/graphql`,
      usageEndpoint: `${hiveUrl}/usage`,
    },
  },
  logging: 'debug',
  transportEntries: overWs
    ? {
        users: {
          options: {
            subscriptions: {
              kind: 'ws',
              location: '/graphql',
            },
          },
        },
      }
    : {},
  genericAuth: genericAuth
    ? {
        mode: 'protect-granular',
        rejectUnauthenticated: false,
        resolveUserFn: () => null,
        // unconditionally reject every `User` field, no directive needed,
        // just to force extended-validation to strip the whole selection set
        // from the document. no `extensions.http.status` here on purpose - that would
        // flip the whole SSE response to that status code before the subscription
        // even starts streaming
        validateUser: ({ parentType, fieldNode }) =>
          parentType.name === 'User'
            ? new GraphQLError('Unauthorized field or type', {
                nodes: [fieldNode],
              })
            : undefined,
      }
    : undefined,
});
