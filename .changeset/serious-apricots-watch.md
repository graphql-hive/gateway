---
'@graphql-hive/gateway': patch
---

Rate limiter default identity now checks WHATWG `Request` for `authorization` and `x-forwarded-for`, ensuring correct caller identification in GraphQL Yoga, Cloudflare Workers, Bun, and other non-Node environments
