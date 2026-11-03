---
'@graphql-hive/gateway': major
'@graphql-hive/gateway-runtime': major
---

Remove deprecated gateway options and CLI flags:

- Persisted documents: `allowArbitraryOperations` → use `allowArbitraryDocuments`
- Rate limiting: bare `rateLimiting: [...]` → `rateLimiting: { config: [...] }`
- Hive Console `usage.clientInfo`: object form removed; pass `(context) => ClientInfo | null`
- CLI: `--hive-registry-token` / `--hive-usage-target` removed; use `--hive-access-token` with `--hive-target` (or usage/trace-specific tokens)
