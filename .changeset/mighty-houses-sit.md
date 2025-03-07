---
'@graphql-tools/batch-delegate': patch
'@graphql-tools/delegate': patch
---

Remove the index from the batched error;

In case of batched delegation (for example multiple book entitites fetched from different places from a field), remove the index from the error message, as it is not relevant in this case. 

[See the test](https://github.com/graphql-hive/gateway/blob/ff61b87b5928f065edfd3a6e6c0fd13bc2beac45/packages/stitch/tests/stitchSchemasPathBug.test.ts)