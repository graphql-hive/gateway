---
'@graphql-tools/executor-http': patch
'@graphql-hive/gateway-runtime': patch
---

Use more specific error codes;

`GATEWAY_TIMEOUT` -> Server could not get a response from upstream in time
`SUBREQUEST_HTTP_ERROR` -> An error occurred while making the HTTP request to the upstream
`RESPONSE_VALIDATION_FAILED` -> The response from upstream did not conform to the expected GraphQL response format
