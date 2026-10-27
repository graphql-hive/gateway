---
'@graphql-tools/batch-delegate': patch
---

Scope batch delegation loaders to both the `rootValue` and the `context`

Servers like mercurius pass the same `rootValue` object to every execution, which made the loaders outlive the request and serve stale results and stale variable values on subsequent requests.

Closes #2630
