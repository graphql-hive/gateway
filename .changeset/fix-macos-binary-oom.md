---
"@graphql-hive/gateway": patch
---

Fix macOS binary builds that were intermittently failing with an out-of-memory crash during the Rollup bundling step on GitHub Actions macOS runners. The bundle is now built once on Linux and shared as a GitHub Actions artifact, so macOS and Windows runners only need to do the platform-specific SEA blob generation and binary packaging.
