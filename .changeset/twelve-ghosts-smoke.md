---
'@graphql-mesh/transport-ws': patch
---

Avoid having an extra Client instantiation in the transport, and use the one in the executor
