---
'@graphql-hive/gateway-runtime': patch
---

Fix granular authorization returning HTTP 401 alongside partial GraphQL data when `genericAuth.rejectUnauthenticated` is `false`

Default field-level authorization failures now use HTTP 200 in this configuration. Unauthorized fields remain `null` with an `UNAUTHORIZED_FIELD_OR_TYPE` error, while permitted data is still returned. This prevents HTTP intermediaries that discard non-2xx response bodies from hiding otherwise usable partial responses.

For example, when JWT authentication is already configured to populate `context.jwt` with a verified payload, configure granular authorization as follows:

```ts
import { defineConfig } from '@graphql-hive/gateway'

export default defineConfig({
  supergraph: './supergraph.graphql',
  genericAuth: {
    mode: 'protect-granular',
    resolveUserFn: context => context.jwt?.payload,
    extractScopes: payload => payload?.roles || [],
    rejectUnauthenticated: false
  }
})
```

Given these types in the graph:

```graphql
directive @requiresScopes(scopes: [[String!]!]!) on OBJECT | FIELD_DEFINITION

type Query {
  invoice: Invoice
}

type Invoice @requiresScopes(scopes: [["GraphQLLabDemo"]]) {
  id: ID!
  title: String
  amount: Float @requiresScopes(scopes: [["ExtraPrivileged"]])
}
```

A user whose verified JWT contains `roles: ['GraphQLLabDemo']`, but not `ExtraPrivileged`, can request:

```graphql
{
  invoice {
    id
    title
    amount
  }
}
```

The gateway returns HTTP 200 with partial data and the authorization error:

```json
{
  "data": {
    "invoice": {
      "id": "1",
      "title": "insurance",
      "amount": null
    }
  },
  "errors": [
    {
      "message": "Unauthorized field or type",
      "locations": [{ "line": 5, "column": 5 }],
      "path": ["invoice", "amount"],
      "extensions": {
        "code": "UNAUTHORIZED_FIELD_OR_TYPE"
      }
    }
  ]
}
```

Whole-operation rejection remains unchanged: setting `rejectUnauthenticated: true`, or omitting it, still returns HTTP 401 for default authorization failures. Custom `validateUser` functions and JWT-level rejection settings are unaffected.
