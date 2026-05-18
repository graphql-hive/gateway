---
'@graphql-tools/delegate': patch
---

Fix cross-subgraph delegation for unavailable fields selected through inline fragments or fragment spreads on interface fields.

The fix in `extractUnavailableFieldsFromSelectionSet` within `extractUnavailableFields.ts` now preserves the fragment wrapper and type condition, so concrete-type fields do not lose their type context and get treated as missing.
