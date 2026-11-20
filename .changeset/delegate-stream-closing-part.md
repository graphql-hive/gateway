---
'@graphql-tools/delegate': patch
---

Do not add a `null` item to a streamed list when the subgraph ends the stream with `{ "hasNext": false }`
