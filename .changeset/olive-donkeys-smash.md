---
'@graphql-tools/executor-http': patch
---

Release the connection when an SSE subscription is torn down

`handleEventStreamResponse` called `reader.releaseLock()` on normal teardown,
which detaches the reader but leaves the response body un-cancelled, so the
underlying HTTP connection was never released and the socket stayed open until
the process exited. Long-running consumers accumulated one leaked connection per
disposed subscription.

It now calls `reader.cancel()`, which propagates cancellation and closes the
connection. The error path already used `cancel()`; only the normal path did not.
