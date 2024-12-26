---
'@graphql-mesh/hmac-upstream-signature': patch
'@graphql-tools/executor-graphql-ws': patch
'@graphql-tools/executor-common': patch
'@graphql-mesh/transport-common': patch
'@graphql-mesh/transport-http': patch
'@graphql-tools/executor-http': patch
'@graphql-mesh/transport-ws': patch
---

Like HMAC Upstream Signature plugin, different components of the gateway were using different ways of serializing the execution request.
Some of them were ignoring `variables` if it is empty, some of not, this was causing the signature generation to be different for the same query.
For example, it was working as expected in Proxy mode, but not working as expected in Federation Gateway mode.

With this change, now we have a shared helper to serialize the upstream execution request with a memoized `print` function for query AST etc to have a consistent serialization so consistent signature generation for HMAC.
