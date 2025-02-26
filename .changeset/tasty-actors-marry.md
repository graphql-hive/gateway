---
'@graphql-hive/gateway-runtime': minor
---

New Cache related hooks;

`onCacheGet`: invoked when a cache get operation is performed.
`onCacheMiss`: invoked when the performed get operation does not find a cache entry.
`onCacheHit`: invoked when the performed get operation finds a cache entry.
`onCacheGetError`: invoked when an error occurs during a cache get operation.

`onCacheSet`: invoked when a cache set operation is performed.
`onCacheSetDone`: invoked when the performed set operation is completed.
`onCacheSetError`: invoked when an error occurs during a cache set operation.

`onCacheDelete`: invoked when a cache delete operation is performed.
`onCacheDeleteDone`: invoked when the performed delete operation is completed.
`onCacheDeleteError`: invoked when an error occurs during a cache delete operation.
