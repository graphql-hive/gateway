---
'@graphql-tools/delegate': patch
---

Do not ignore request selection set when overriding the fields

```ts
import { buildSchema, graphql } from 'graphql';
import { addResolversToSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { delegateToSchema } from '@graphql-tools/delegate';

const sub_schema = addResolversToSchema({
  schema: buildSchema(`
  type Query {
    current_user: User
  }

  type User {
    id: ID!
    name: String!
    age: Int!
  }
`),
  resolvers: {
    Query: {
      current_user: () => ({ id: '5', name: 'John Doe', age: 10 }),
    },
  },
});

const stitched_schema = stitchSchemas({
  subschemas: [
    {
      schema: sub_schema,
      createProxyingResolver: (options) => {
        return (_parent, _args, context, info) => {
          const operationName = info.operation.name ? info.operation.name.value : undefined;
          return delegateToSchema({
            schema: options.subschemaConfig,
            operation: options.operation,
            context,
            info,
            operationName,
          });
        };
      },
    },
  ],
  resolvers: {
    User: {
      name: {
        selectionSet: '{ age }',
        resolve: (parent) => `${parent.name}(${parent.age})`, // Age should be here
      },
    },
  },
});
```