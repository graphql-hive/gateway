---
'@graphql-hive/gateway': patch
---

Updates @graphql-hive/render-laboratory to fix "Unexpected invariant triggered" error in the schema explorer when introspecting servers running graphql-js 16.14+. graphql-js 16.14.0 added `DIRECTIVE_DEFINITION` to the `@deprecated` directive's introspection locations
