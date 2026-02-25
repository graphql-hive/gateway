---
'@graphql-hive/gateway': minor
---

Support Rust QP as builtin in Docker image

While running the Docker image of the gateway, you can now use Rust QP as the builtin query planner.

```sh
docker run \
  -e HIVE_ROUTER_RUNTIME=true \
  -p 8080:8080 \
  -v "$(pwd)/supergraph.graphql:/gateway/supergraph.graphql" \
  ghcr.io/graphql-hive/gateway supergraph --port=8080
```
