---
'@graphql-tools/delegate': major
---

Breaking changes in `createRequest` function;
- No more `sourceParentType`, `sourceFieldName`, `variableDefinitions`, `variableValues` and `targetRootValue`
- `transformedSchema` is a required option now and `args` is also accepted as a map of the arguments of the target field
- `fragments` is now an array of `FragmentDefinitionNode` instead of a record `{ [fragmentName: string]: FragmentDefinitionNode }`
