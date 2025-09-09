---
'@graphql-hive/gateway-runtime': patch
---

In `persistedDocuments` options, `allowArbitraryOperations` flag has been deprecated, and introduced `allowArbitraryDocuments` for both Hive Console and custom store sources

```diff
defineConfig({
/* .. */
persistedDocuments: {
   /* .. */
-   allowArbitraryOperations: true,
+   allowArbitraryDocuments: true,
},
});
```