---
'@graphql-hive/gateway-runtime': major
---

GraphQL multipart request support is disabled by default

The only objective of [GraphQL multipart request spec](https://github.com/jaydenseric/graphql-multipart-request-spec) is to support file uploads; however, file uploads are not native to GraphQL and are generally considered an anti-pattern.
