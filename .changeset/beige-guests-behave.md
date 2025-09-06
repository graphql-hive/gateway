---
'@graphql-mesh/fusion-runtime': minor
---

Support client side pubsub operation definition with `@pubsubOperation`

Instead of `@resolveTo` on the gateway-side configuration with `additionalTypeDefs`, now you can define those operations on the subgraphs directly. Since this is a additional directive provided by Mesh, you need to use `@composeDirective`

```graphql
          extend schema @link(
            url: "https://specs.apollo.dev/federation/v2.6"
            import: ["@key", "@composeDirective"]
          )
          @link(
            url: "https://the-guild.dev/mesh/v1.0"
            import: ["@pubsubOperation"]
          )
          @composeDirective(name: "@pubsubOperation")

        directive @pubsubOperation(
          pubsubTopic: String!
          filterBy: String
          result: String
        ) on FIELD_DEFINITION

        type Query {
          hello: String!
        }
        type Product @key(fields: "id") {
          id: ID!
          name: String!
          price: Float!
        }

        type Subscription {
          newProductSubgraph: Product! @pubsubOperation(pubsubTopic: "new_product")
        }
```
