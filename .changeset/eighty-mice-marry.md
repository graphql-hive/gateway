---
'@graphql-tools/executor-http': minor
'@graphql-mesh/transport-http': minor
---

Add `useGETForHashedQueries` support for downstream APQ requests so hash-only
query probes can use GET while full-query fallbacks continue to use POST.

Add the `useContentTypeForGETRequests` opt-in for GET requests that need
`content-type: application/json` compatibility.
