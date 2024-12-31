import {
  createRenameFieldTransform,
  createRenameTypeTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('authors', {
        endpoint: `http://localhost:${4001}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('books', {
        endpoint: `http://localhost:${4002}/graphql`,
      }),
      transforms: [
        createRenameFieldTransform(({ fieldName, typeName }) =>
          typeName === 'Query' && fieldName === 'authorWithBooks'
            ? 'author'
            : fieldName,
        ),
        createRenameTypeTransform(({ typeName }) =>
          typeName === 'AuthorWithBooks' ? 'Author' : typeName,
        ),
      ],
    },
  ],
  additionalTypeDefs: /* GraphQL */ `
    extend type Book {
      author: Author
        @resolveTo(
          sourceName: "authors"
          sourceTypeName: "Query"
          sourceFieldName: "authors"
          keyField: "authorId"
          keysArg: "ids"
        )
    }
  `,
});
