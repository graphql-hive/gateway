---
'@graphql-mesh/fusion-runtime': patch
---

Fix a memory leak where every supergraph reload retained the whole previous schema when the `supergraph` option is a synchronous function
