---
'@graphql-hive/gateway-runtime': minor
'@graphql-hive/gateway': minor
---

Add Layer 2 cache support for persisted documents.

When using Hive CDN for persisted documents, you can now configure caching using the gateway's cache to reduce CDN requests and improve response times across gateway instances.

**Configuration:**
```typescript
persistedDocuments: {
  type: 'hive',
  endpoint: 'https://cdn.graphql-hive.com/artifacts/v1/<target_id>',
  token: '<cdn_access_token>',
  cacheTtlSeconds: 3600,
  cacheNotFoundTtlSeconds: 60,
}
```

**CLI options:**
- `--hive-persisted-documents-cache-ttl <seconds>` - TTL in seconds for found documents (enables caching)
- `--hive-persisted-documents-cache-not-found-ttl <seconds>` - TTL for negative cache entries (default: 60)

**Note:** A gateway cache backend must be configured for caching to work. If cache options are provided without a gateway cache, a warning will be logged and caching will be disabled.
