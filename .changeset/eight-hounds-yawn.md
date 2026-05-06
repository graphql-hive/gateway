---
'@graphql-hive/gateway': minor
---

Add `requestDeadline` option to set a hard end-to-end time limit in milliseconds for the entire request lifecycle. Unlike `requestTimeout`, this deadline is not cancelled when the request body is received - it runs until the response is finished. When exceeded, the server responds with a 503 and closes the connection.
