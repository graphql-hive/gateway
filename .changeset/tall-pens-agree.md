---
'@graphql-tools/delegate': major
---

Breaking changes in `createRequest` function;
- No more `sourceParentType`, `sourceFieldName`, `variableDefinitions`, `variableValues` and `targetRootValue`
- `targetRootValue` has been renamed to `rootValue`
- `targetSchema` is a required option now and `args` is also accepted as a map of the arguments of the target field
- `fragments` is now an array of `FragmentDefinitionNode` instead of a record `{ [fragmentName: string]: FragmentDefinitionNode }`

Breaking changes in `delegateRequest` and `delegateToSchema` functions;
- No more `transformedSchema` option, it has been renamed to `targetSchema`
- `targetSchema` is a required option now