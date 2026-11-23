---
'@graphql-tools/executor-http': minor
---

Add an opt-in raw result to the HTTP executor

An execution request can carry an acceptor under the `RAW_RESULT_ACCEPTOR` symbol. The acceptor is shown the response body as bytes; when it accepts them, the executor does not parse the body. The result then exposes `data` as a getter that parses on first read, and `getRawResultBody(result)` returns the bytes for as long as `data` has not been read or replaced. When the acceptor rejects the body, or no acceptor is set, the result is parsed as before.

Consumers of a deduplicated in-flight request each get their own result over the same bytes instead of a deep clone.
