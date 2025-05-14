---
'@graphql-hive/gateway-runtime': patch
---

If metadata is included the result with `includeExtensionMetadata`, `cost.estimated` should always be added to the result extensions even if no cost is calculated.
