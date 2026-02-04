---
'@graphql-tools/delegate': patch
'@graphql-tools/stitch': patch
'@graphql-tools/federation': patch
---

- Handle the type merging order correctly with custom labels and percentage labels for progressive override
- Do not pass `percent(x)` labels to the progressive override handler
- Apply progressive override to the shared root fields