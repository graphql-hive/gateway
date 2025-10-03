import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { parse, print } from 'graphql';
import { expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

const authors = [
  {
    id: 'a1',
    name: 'John',
    yearsOfExperience: 5,
  },
  {
    id: 'a2',
    name: 'Jane',
    yearsOfExperience: 20,
  },
];

const posts = [
  {
    id: 'p1',
    body: 'p1-body',
    author: authors[0],
  },
  {
    id: 'p2',
    body: 'p2-body',
    author: authors[1],
  },
];

const supergraph = await getStitchedSchemaFromLocalSchemas({
  localSchemas: {
    a: buildSubgraphSchema([
      {
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@external", "@requires"]
            )

          type Query {
            feed: [Post]
          }

          type Post @key(fields: "id") {
            id: ID!
            byNovice: Boolean! @external
            byExpert: Boolean! @requires(fields: "byNovice")
          }

          type Author @key(fields: "id") {
            id: ID!
            name: String!
            yearsOfExperience: Int!
          }
        `),
        resolvers: {
          Query: {
            feed() {
              return posts.map((post) => ({ id: post.id }));
            },
          },
          Post: {
            __resolveReference(ref: { id: string; byNovice?: boolean }) {
              const post = posts.find((post) => post.id === ref.id);
              if (!post) {
                return null;
              }
              if (ref.byNovice == null) {
                return {
                  id: post.id,
                };
              }
              return {
                id: post.id,
                byNovice: ref.byNovice,
              };
            },
            byExpert(post: { byNovice: boolean }) {
              if (post.byNovice == null) {
                // ensuring requires is not skipped
                return null;
              }
              return !post.byNovice;
            },
          },
          Author: {
            __resolveReference(ref: { id: string }) {
              const author = authors.find((author) => author.id === ref.id);
              if (!author) {
                return null;
              }
              return {
                id: author.id,
                name: author.name,
                yearsOfExperience: author.yearsOfExperience,
              };
            },
          },
        },
      },
    ]),
    b: buildSubgraphSchema([
      {
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@external", "@requires"]
            )

          type Post @key(fields: "id") {
            id: ID!
            author: Author!
            byNovice: Boolean! @requires(fields: "author { yearsOfExperience }")
          }

          type Author @key(fields: "id") {
            id: ID!
            yearsOfExperience: Int! @external
          }
        `),
        resolvers: {
          Post: {
            __resolveReference(ref: {
              id: string;
              author?: { yearsOfExperience: number };
            }) {
              const post = posts.find((post) => post.id === ref.id);
              if (!post) {
                return null;
              }
              return {
                id: post.id,
                author: {
                  id: post.author!.id,
                  ...ref.author,
                },
              };
            },
            byNovice(post: { author: { yearsOfExperience: number } }) {
              return post.author.yearsOfExperience < 10;
            },
          },
        },
      },
    ]),
  },
  onSubgraphExecute(subgraph, executionRequest, result) {
    const query = print(executionRequest.document);
    console.log(query);
    // if (subgraph === 'a' && query.includes('_entities')) {
    //   // debugger;
    // }
  },
});

it('test query 0', { timeout: 1000 }, async () => {
  await expect(
    normalizedExecutor({
      schema: supergraph,
      document: parse(/* GraphQL */ `
        {
          feed {
            byNovice
          }
        }
      `),
    }),
  ).resolves.toEqual({
    data: {
      feed: [
        {
          byNovice: true,
        },
        {
          byNovice: false,
        },
      ],
    },
  });
});

it('test query 1', { timeout: 1000 }, async () => {
  await expect(
    normalizedExecutor({
      schema: supergraph,
      document: parse(/* GraphQL */ `
        {
          feed {
            byExpert
          }
        }
      `),
    }),
  ).resolves.toEqual({
    data: {
      feed: [
        {
          byExpert: false,
        },
        {
          byExpert: true,
        },
      ],
    },
  });
});
