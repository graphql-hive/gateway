---
'@graphql-mesh/fusion-runtime': patch
'@graphql-hive/gateway-runtime': patch
---

Leave the supergraph configuration handling logic to fusion-runtime package so it can compare bare read supergraph sdl directly inside unified graph manager to decide if the supergraph has changed.
