---
'@graphql-hive/gateway-runtime': minor
'@graphql-hive/gateway': minor
---

Add Layer 2 cache support for persisted documents.

When using Hive CDN for persisted documents, you can now configure a distributed cache (Redis or any KeyValueCache backend) to reduce CDN requests and improve response times across gateway instances.

**Redis configuration:**
```typescript
persistedDocuments: {
  type: 'hive',
  endpoint: 'https://cdn.graphql-hive.com/artifacts/v1/<target_id>',
  token: '<cdn_access_token>',
  cache: {
    type: 'redis',
    url: 'redis://localhost:6379',
    ttlSeconds: 3600,
    notFoundTtlSeconds: 60,
  },
}
```

**KeyValueCache configuration (for Cloudflare KV, Upstash, etc.):**
```typescript
persistedDocuments: {
  type: 'hive',
  endpoint: 'https://cdn.graphql-hive.com/artifacts/v1/<target_id>',
  token: '<cdn_access_token>',
  cache: {
    type: 'keyvalue',
    cache: myKeyValueCacheInstance,
    ttlSeconds: 3600,
  },
}
```

**CLI options:**
- `--hive-persisted-documents-cache-redis-url` - Redis URL for caching
- `--hive-persisted-documents-cache-redis-key-prefix` - Key prefix (default: "hive:pd:")
- `--hive-persisted-documents-cache-ttl` - TTL in seconds for found documents
- `--hive-persisted-documents-cache-not-found-ttl` - TTL for negative cache entries (default: 60)
