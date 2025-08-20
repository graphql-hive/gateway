import { defineConfig } from '@graphql-hive/gateway';
import useMeshLiveQuery from '@graphql-mesh/plugin-live-query';

export const gatewayConfig = defineConfig({
  webhooks: true,
  plugins: (ctx) => [
    useMeshLiveQuery({
      ...ctx,
      invalidations: [
        {
          field: 'Mutation.addTodo',
          invalidate: ['Query.todos'],
        },
      ],
    }),
  ],
});
