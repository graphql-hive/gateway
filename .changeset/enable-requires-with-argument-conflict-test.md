---
"@graphql-tools/federation": patch
---

Enable the `requires-with-argument-conflict` federation audit compatibility test and fix stitching behavior for conflicting `@requires` argument selections on computed fields by isolating conflict groups into separate subschema configs.
