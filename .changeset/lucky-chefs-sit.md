---
'@graphql-tools/delegate': patch
---

Fix compatibility with GraphQL 14 and 15 by avoiding runtime access to the `OperationTypeNode` enum, which is only available in GraphQL 16 and later

Closes #2643
