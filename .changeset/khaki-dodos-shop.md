---
'@graphql-hive/gateway': patch
---

Bundle `parse-duration` dependency

[`parse-duration` is ESM only starting from v2](https://github.com/jkroso/parse-duration/releases/tag/v2.0.0). We therefore bundle it in because doing so we transpile it to CJS and allow importing the GW in CJS.
