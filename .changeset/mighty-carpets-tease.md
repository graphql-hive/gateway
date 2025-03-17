---
'@graphql-mesh/transport-http-callback': patch
'@graphql-tools/executor-graphql-ws': patch
---

Use signal.addEventListener instead of leaking `registerAbortSignalListener` helper
