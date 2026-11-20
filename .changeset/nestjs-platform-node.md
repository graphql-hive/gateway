---
'@graphql-hive/nestjs': major
---

Support NestJS 12 and the `@nestjs/platform-node` HTTP adapter. Drop NestJS 10 and 11 support.

`HiveGatewayDriver` now accepts the `@nestjs/platform-node` adapter (`getType() === 'node'`), alongside Express and Fastify. The adapter's `NodeRequest` and `NodeResponse` are available as `req` and `res` in the GraphQL context.

The peer dependencies are now `@nestjs/common@^12` and `@nestjs/graphql@^14`. Upgrade NestJS to 12 and `@nestjs/graphql` to 14.

`@nestjs/graphql` 14 removed `subscriptions-transport-ws`, so the driver no longer configures it. Use `subscriptions: { 'graphql-ws': true }`, or `installSubscriptionHandlers: true`, which now registers `graphql-ws`, and move clients to the `graphql-transport-ws` protocol.
