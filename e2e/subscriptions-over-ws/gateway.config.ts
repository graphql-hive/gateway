import {
  defineConfig,
  GatewayPlugin,
  WSTransportOptions,
} from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  plugins: () => [
    {
      onContextBuilding({ extendContext }) {
        extendContext({
          user: { id: 'john' },
        });
      },
    } as GatewayPlugin,
  ],
  transportEntries: {
    stream: {
      options: {
        subscriptions: {
          kind: 'ws',
          location: '/graphql',
          options: {
            connectionParams: {
              userId: '{context.user.id}',
            },
          } satisfies WSTransportOptions,
        },
      },
    },
  },
});
