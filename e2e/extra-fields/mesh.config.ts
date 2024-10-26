import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('foo', {
        endpoint: `http://localhost:${opts.getServicePort('foo')}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('bar', {
        endpoint: `http://localhost:${opts.getServicePort('bar')}/graphql`,
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
