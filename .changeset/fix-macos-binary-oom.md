---
"@graphql-hive/gateway": patch
---

Fix missing macOS binaries for v2.6.x and v2.7.0: the Rollup bundling step was running on every OS in the binary matrix (including macOS), occasionally crashing with an out-of-memory error. The bundle is now built once on Linux and shared as a GitHub Actions artifact, so macOS and Windows runners only need to do the platform-specific SEA blob generation and binary packaging.
