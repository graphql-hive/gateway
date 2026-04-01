---
'@graphql-hive/router-runtime': patch
---

Update `@graphql-hive/router-query-planner` to v0.0.17

This update includes fixes in the query planner:

- **Preserve client aliases in mismatch output rewrites**: Fixed query planner mismatch handling so conflicting fields are tracked by response key (alias-aware), and internal alias rewrites restore the original client-facing key (alias-or-name) instead of always the schema field name.
