import {
  createNamingConventionTransform,
  defineConfig,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);
const authorsPort = opts.getServicePort('authors');
const booksPort = opts.getServicePort('books');

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('authors', {
        source: `http://localhost:${authorsPort}/openapi.json`,
        endpoint: `http://localhost:${authorsPort}`,
      }),
      transforms: [
        createNamingConventionTransform({
          fieldNames: 'camelCase',
          fieldArgumentNames: 'camelCase',
        }),
      ],
    },
    {
      sourceHandler: loadOpenAPISubgraph('books', {
        source: `http://localhost:${booksPort}/openapi.json`,
        endpoint: `http://localhost:${booksPort}`,
        ignoreErrorResponses: true,
      }),
      transforms: [
        createNamingConventionTransform({
          fieldNames: 'camelCase',
          fieldArgumentNames: 'camelCase',
        }),
      ],
    },
  ],
  additionalTypeDefs: /* GraphQL */ `
    extend type Book {
      author: Author
        @resolveTo(
          sourceName: "authors"
          sourceTypeName: "Query"
          sourceFieldName: "getAuthor"
          requiredSelectionSet: "{ authorId }"
          sourceArgs: { authorId: "{root.authorId}" }
        )
    }
  `,
});
