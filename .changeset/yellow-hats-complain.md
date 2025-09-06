---
'@graphql-mesh/fusion-runtime': minor
'@graphql-hive/gateway': minor
'@graphql-hive/gateway-runtime': minor
---

New directive `@pubsubPublish` to publish the payload to the pubsub engine directly


```graphql
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.6"
            import: ["@key", "@composeDirective"]
          )
          @link(
            url: "https://the-guild.dev/mesh/v1.0"
            import: ["@pubsubOperation", "@pubsubPublish"]
          )
          @composeDirective(name: "@pubsubOperation")
          @composeDirective(name: "@pubsubPublish")

        directive @pubsubOperation(
          pubsubTopic: String!
          filterBy: String
          result: String
        ) on FIELD_DEFINITION

        directive @pubsubPublish(pubsubTopic: String!) on FIELD_DEFINITION

        type Query {
          hello: String!
        }
        type Product @key(fields: "id") {
          id: ID!
          name: String!
          price: Float!
        }

        type Mutation {
          createProduct(name: String!, price: Float!): Product!
            @pubsubPublish(pubsubTopic: "new_product")
        }

        type Subscription {
          newProductSubgraph: Product!
            @pubsubOperation(pubsubTopic: "new_product")
        }
```