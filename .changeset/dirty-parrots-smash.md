---
'@graphql-hive/gateway': patch
---

Load \`node:http\` and \`node:https\` lazily so that instrumentations of tracing/metrics tools can attach easily such as Sentry, AppDynamic etc
