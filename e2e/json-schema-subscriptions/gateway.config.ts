import { defineConfig } from '@graphql-hive/gateway';
import { MeshPubSub } from '@graphql-hive/pubsub/mesh';
import useMeshLiveQuery from '@graphql-mesh/plugin-live-query';

export const gatewayConfig = defineConfig({
  webhooks: true,
  plugins: (ctx) => [
    useMeshLiveQuery({
      ...ctx,
      pubsub: MeshPubSub.from(ctx.pubsub),
      invalidations: [
        {
          field: 'Mutation.addTodo',
          invalidate: ['Query.todos'],
        },
      ],
    }),
  ],
});
