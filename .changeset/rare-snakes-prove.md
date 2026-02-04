---
'@graphql-tools/batch-execute': minor
---

# Execution cancellation on batched requests

When using [Batched Execution](https://the-guild.dev/graphql/stitching/handbook/appendices/batching-arrays-and-queries), it is now possible to cancel the entire batched request if all individual requests' `AbortSignal`s are aborted. This enhancement improves resource management and responsiveness in applications that utilize batched GraphQL operations.

Previously, aborting individual requests did not affect the batched request. With this update, if all individual requests signal an abort, the batched request will also be aborted, ensuring that unnecessary processing is avoided.

This feature is implemented using the new utility function `AbortSignal.all`, which combines multiple `AbortSignal` instances into a single signal. If all of the requests are aborted, the combined signal will also be aborted.