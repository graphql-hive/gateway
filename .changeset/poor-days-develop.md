---
'@graphql-hive/gateway-abort-signal-any': patch
'@graphql-tools/executor-http': patch
'@graphql-hive/gateway-runtime': patch
---

Introduce disposable timeout signals.

When `AbortSignal.timeout(MS)` is used, the timer is not cleaned up until it finishes. 
This leads to memory leaks when the signal is not used anymore. 

This change introduces a disposable timeout signal that cleans up the timer when the signal is disposed, and in the plugins the signal is disposed whenever the operation is completed.