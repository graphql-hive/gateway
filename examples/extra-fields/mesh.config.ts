import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('foo', {
        endpoint: `http://localhost:${4001}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('bar', {
        endpoint: `http://localhost:${4002}/graphql`,
      }),
    },
  ],
  additionalTypeDefs: /* GraphQL */ `
    extend type Foo {
      bar: Bar
        @resolveTo(
          sourceName: "bar"
          sourceTypeName: "Query"
          sourceFieldName: "bar"
        )
    }

    extend type Bar {
      foo: Foo
        @resolveTo(
          sourceName: "foo"
          sourceTypeName: "Query"
          sourceFieldName: "foo"
        )
    }
  `,
});
