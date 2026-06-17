---
'@graphql-hive/gateway': patch
---

Rate limiter default identity now checks `context.request.headers` (WHATWG `Request`) for `authorization` and `x-forwarded-for`, ensuring correct caller identification in GraphQL Yoga, Cloudflare Workers, Bun, and other non-Node environments. `host` header removed from the fallback chain as it identifies the server, not the caller.
