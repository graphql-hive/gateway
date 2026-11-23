---
'@graphql-hive/gateway': minor
'@graphql-hive/gateway-runtime': minor
'@graphql-tools/stitch': minor
'@graphql-tools/stitching-directives': minor
'@graphql-tools/wrap': minor
---

Support GraphQL v17

Hive Gateway and the stitching, wrapping and federation packages work with GraphQL v17 alongside v16. The `graphql` peer dependency range stays `^16 || ^17`, so projects that install the packages themselves keep the GraphQL version they already use.

Schema stitching, schema wrapping (including `TransformEnumValues` with defaults defined in SDL), `federationToStitchingSDL` and demand control behave the same on both versions.

## Docker images and binary ship GraphQL v17

The Hive Gateway Docker images and the standalone binary come with `graphql@17.1.0`. Custom code loaded by the gateway configuration, like plugins, additional resolvers, transforms and hooks, runs against GraphQL v17. Code that only uses the gateway APIs needs no changes. Code that uses GraphQL internals directly might, see the [GraphQL.js v16 to v17 upgrade guide](https://www.graphql-js.org/upgrade-guides/v16-v17/) for all changes.

### Variable values in resolver info

`info.variableValues` is an object of `{ sources, coerced }` instead of a flat map of variable names to values. Read the variable values from `info.variableValues.coerced`, or use `getCoercedVariableValues` from `@graphql-tools/delegate` to support both versions.

```ts
import { getCoercedVariableValues } from '@graphql-tools/delegate';

const variables = getCoercedVariableValues(info.variableValues);
```

### Calling `getArgumentValues` and `getDirectiveValues`

The `variableValues` argument of `getArgumentValues` and `getDirectiveValues` from `graphql` expects the `{ sources, coerced }` shape too. Wrap a flat map of variables with `asGetArgumentValuesVariables` from `@graphql-tools/utils`, which works with both versions.

```ts
import { asGetArgumentValuesVariables } from '@graphql-tools/utils';
import { getArgumentValues } from 'graphql';

const args = getArgumentValues(
  field,
  fieldNode,
  asGetArgumentValuesVariables(variables),
);
```

### Empty lists in parsed documents

Parsed documents leave out empty lists. For example, a field without arguments has `arguments` set to `undefined` instead of `[]`, and the same goes for `directives`, `variableDefinitions`, `interfaces` and `fields`. Use optional chaining or a fallback like `node.directives ?? []` when reading them.

### Default values defined in SDL

Default values of arguments and input fields defined in SDL are kept as an AST node in `default.literal`, and `defaultValue` is `undefined`. Read `default` first and fall back to `defaultValue` to support both versions. When mapping a schema and changing a default, set `default` to `undefined` next to the new `defaultValue`, otherwise the literal from SDL is still used.

### Custom scalars

Scalars have the `coerceOutputValue`, `coerceInputValue`, `coerceInputLiteral` and `valueToLiteral` functions next to the deprecated `serialize`, `parseValue` and `parseLiteral`. When building a scalar from another scalar's `toConfig()` and replacing its coercion, replace the new functions too, otherwise they keep coercing with the original implementation.

### Errors

`GraphQLError` sets the standard `cause` property to its original error. Errors from subgraphs that the gateway relays to clients have the subgraph error as `cause`. What clients receive stays the same.

### Printing and introspection

`print` formats object values with spaces, like `{ a: 1 }` instead of `{a: 1}`, and breaks long ones over several lines. The `reason` argument of `@deprecated` and the `includeDeprecated` argument of introspection fields are non-nullable. Update snapshots or string comparisons of printed documents and introspection results.

Closes #2750
