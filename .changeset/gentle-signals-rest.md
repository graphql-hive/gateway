---
'@graphql-hive/signal': minor
---

`abortSignalAny` leaves out duplicate signals and the ones another passed signal already follows, and the new `disposeAbortSignal` removes the listeners of a combined signal once it's done with
