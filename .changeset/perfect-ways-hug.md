---
'@graphql-mesh/hmac-upstream-signature': patch
'@graphql-mesh/transport-http-callback': patch
'@graphql-mesh/plugin-opentelemetry': patch
'@graphql-mesh/plugin-prometheus': patch
'@graphql-mesh/transport-common': patch
'@graphql-mesh/transport-http': patch
'@graphql-mesh/transport-ws': patch
'@graphql-tools/wrap': patch
---

`onError` and `onEnd` callbacks when mapping async iterators are invoked only once regardless of how many times throw/return was called on the iterator
