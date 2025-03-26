---
'@graphql-mesh/fusion-runtime': patch
---

Fail when the fetcher returns an empty result. Previously even if fetcher returns `undefined`, the runtime was trying to handle the result then fails with a cryptic error
