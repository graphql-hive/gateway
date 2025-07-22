---
'@graphql-tools/executor-http': patch
---

Avoid shared AbortController instance on CloudflareWorkers because it gives `Cannot perform I/O on behalf of a different request.` error.
This change ensures that the AbortController is only created when not running in a Cloudflare Workers environment.