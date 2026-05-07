---
"@graphql-hive/gateway": patch
---

Fix missing macOS binaries for v2.6.x and v2.7.0 caused by an out-of-memory crash during the Rollup bundling step on GitHub Actions macOS runners. The bundle step now runs with an increased Node.js heap size (`--max-old-space-size=6144`) to prevent intermittent OOM failures.
