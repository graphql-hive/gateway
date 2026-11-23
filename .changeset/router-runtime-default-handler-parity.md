---
'@graphql-hive/router-runtime': patch
---

Respond like the default handler to bad variables

A variable that can't be coerced, like a string for an `Int` or an `@oneOf` input with two keys, is now responded to with HTTP 400 instead of 200.

Closes #2773
