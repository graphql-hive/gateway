---
'@graphql-tools/executor-http': patch
---

Add `TypeError` to `originalError` prop of the error thrown when no `data` and `errors` found in the HTTP response, then GraphQL Servers know that it is an unexpected error so it should be masked and logged seperately instead of leaking to the client
