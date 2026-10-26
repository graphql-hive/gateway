---
'@graphql-tools/delegate': patch
'@graphql-tools/executor-http': patch
---

Reduce allocation during delegation: clone HTTP query results only when the in-flight request has multiple consumers, construct compact fresh null-prototype field metadata maps, reuse a local annotation descriptor, and avoid temporary fake-promise wrappers for synchronous composite completion. Preserve shared-request isolation, metadata descriptors, and asynchronous completion behavior.
