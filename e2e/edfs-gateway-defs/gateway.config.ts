import { defineConfig } from '@graphql-hive/gateway';
import { createPubSub } from './pubsub';

export const gatewayConfig = defineConfig({
  maskedErrors: false,
  pubsub: await createPubSub(),
  additionalTypeDefs: /* GraphQL */ `
    extend schema {
      subscription: Subscription
    }
    type Subscription {
      newProduct: Product! @resolveTo(pubsubTopic: "new_product")
    }
  `,
});
