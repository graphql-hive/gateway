---
'@graphql-mesh/plugin-prometheus': patch
---

Plugin stops and handles parsing errors

Previously it would throw an unhandled exception becauase Prometheus was expecting a GraphQL
document in onParse hook always, but it can also be an error.

Actual fix is done in the GraphQL Yoga repository: https://github.com/graphql-hive/graphql-yoga/pull/4296.
