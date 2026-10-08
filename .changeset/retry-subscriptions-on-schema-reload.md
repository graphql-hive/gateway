---
'@graphql-hive/gateway-runtime': minor
---

Retry subscriptions on schema reload instead of surfacing an internal error frame

When the supergraph reloaded, in-flight subscriptions received one final result carrying the runtime's internal abort (`extensions.code: 'SCHEMA_RELOAD'`, http 503) before the stream completed. Queries never see this error because `useRetryOnSchemaReload` retries them, but for subscriptions it leaked to clients, which have no way to tell an internal abort apart from a real subscription failure. Some client caches also carry the error forward onto healthy events that follow a transport-level resubscribe, so one reload could poison an operation permanently.

`useRetryOnSchemaReload` now gives subscriptions the same contract queries have: when the runtime aborts the stream with a schema reload notice, the operation is re-executed against the new schema and the new stream is spliced in, invisibly to the client. If the operation no longer validates against the new schema, that failure is delivered and the stream ends. If re-execution is not possible, the stream completes without the error frame, the same shape clients receive when a gateway instance shuts down.

Only results whose errors are all `SCHEMA_RELOAD` and which carry no non-null data are treated as reload notices. Results with real data or any other error are delivered untouched. Mutations are still never retried, and shutdown (`SHUTTING_DOWN`) is unchanged.
