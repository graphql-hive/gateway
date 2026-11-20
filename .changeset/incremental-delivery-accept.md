---
'@graphql-tools/executor-http': major
'@graphql-tools/delegate': major
'@graphql-mesh/fusion-runtime': major
'@graphql-hive/gateway-runtime': major
'@graphql-mesh/transport-http': major
---

Incremental delivery (`@defer` / `@stream`) Accept negotiation uses the shared `INCREMENTAL_DELIVERY_SPECS` table from `@graphql-tools/utils`.

Client Accept (gateway responses) and upstream Accept (subgraph calls) are separate:

| Direction | Default | Force |
| --- | --- | --- |
| Client → Gateway (Yoga) | Negotiate from `Accept`; echo spec on `Content-Type` | n/a (client-driven) |
| Gateway → Subgraph (`executor-http`) | Bare `multipart/mixed` (no spec param) | `incrementalSpec: 'v0.1' \| 'v0.2'` on executor or `ExecutionRequest` |

| Spec | Accept / Content-Type parameter | Payload |
| --- | --- | --- |
| `'v0.1'` | `multipart/mixed;deferSpec=20220824` | `{ incremental: [{ path, label, data \| items }], hasNext }` |
| `'v0.2'` | `multipart/mixed;incrementalSpec=v0.2` | `pending` / `id` / `subPath` / `completed` |

`mergeIncrementalResult` merges both formats. Force `'v0.1'` when stitching `IncrementalReceiver` needs path/label patches. Client `Accept` is never copied onto upstream `Accept`.
