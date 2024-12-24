---
'@graphql-mesh/transport-http-callback': patch
'@graphql-hive/gateway-abort-signal-any': patch
'@graphql-hive/gateway-runtime': patch
---

Use `registerAbortSignalListener` helper function to register event listeners to `AbortSignal` instances to avoid warning on Node.js like
`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 abort listeners added. Use emitter.setMaxListeners() to increase limit`.