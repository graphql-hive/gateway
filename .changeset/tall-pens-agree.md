---
'@graphql-tools/delegate': major
---

Now `createRequest` function doesn't accept `sourceSchema`, `sourceParentType`, `sourceFieldName`, `variableDefinitions`, `variableValues` and `targetRootValue` but instead it accepts `transformedSchema` which is required and `args` which are the arguments of the target field
