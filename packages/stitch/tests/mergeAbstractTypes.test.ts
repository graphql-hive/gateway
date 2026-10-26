import { delegateToSchema } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { assertSome } from '@graphql-tools/utils';
import { graphql } from 'graphql';
import { describe, expect, it } from 'vitest';

describe('Abstract type merge', () => {
  it('merges with abstract type definitions', async () => {
    const imageSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Image {
          id: ID!
          url: String!
        }
        type Query {
          image(id: ID!): Image
        }
      `,
      resolvers: {
        Query: {
          image: (_root, { id }) => ({ id, url: `/path/to/${id}` }),
        },
      },
    });

    const contentSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Post {
          id: ID!
          leadArt: LeadArt
        }
        type Image {
          id: ID!
        }
        type Video {
          id: ID!
          url: String!
        }
        union LeadArt = Image | Video
        type Query {
          post(id: ID!): Post
        }
      `,
      resolvers: {
        Query: {
          post: (_root, { id }) => ({
            id,
            leadArt: { __typename: 'Image', id: '23' },
          }),
        },
      },
    });

    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema: imageSchema,
          merge: {
            Image: {
              selectionSet: '{ id }',
              fieldName: 'image',
              args: ({ id }) => ({ id }),
            },
          },
        },
        {
          schema: contentSchema,
          merge: {
            Post: {
              selectionSet: '{ id }',
              fieldName: 'post',
              args: ({ id }) => ({ id }),
            },
          },
        },
      ],
    });

    const { data } = await graphql({
      schema: gatewaySchema,
      source: /* GraphQL */ `
        query {
          post(id: 55) {
            leadArt {
              __typename
              ... on Image {
                id
                url
              }
            }
          }
        }
      `,
    });
    assertSome(data);
    const postData: any = data['post'];
    expect(postData.leadArt).toEqual({
      __typename: 'Image',
      url: '/path/to/23',
      id: '23',
    });
  });
});

describe('Merged associations', () => {
  const layoutSchema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      interface Slot {
        id: ID!
      }
      type Post implements Slot {
        id: ID!
      }
      type Network {
        id: ID!
        domain: String
      }
      type Query {
        slots(ids: [ID!]!): [Slot]!
        posts(ids: [ID!]!): [Post]!
        networks(ids: [ID!]!): [Network]!
      }
    `,
    resolvers: {
      Query: {
        slots: (_root, { ids }) =>
          ids.map((id: any) => ({ __typename: 'Post', id })),
        posts: (_root, { ids }) => ids.map((id: any) => ({ id })),
        networks: (_root, { ids }) =>
          ids.map((id: any) => ({ id, domain: `network${id}.com` })),
      },
    },
  });

  const postsSchema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Post {
        id: ID!
        title: String!
        network: Network
      }
      type Network {
        id: ID!
      }
      type Query {
        _posts(ids: [ID!]!): [Post]!
      }
    `,
    resolvers: {
      Query: {
        _posts: (_root, { ids }) =>
          ids.map((id: any) => ({
            id,
            title: `Post ${id}`,
            network: { id: Number(id) + 1 },
          })),
      },
    },
  });

  const gatewaySchema = stitchSchemas({
    subschemas: [
      {
        schema: layoutSchema,
        merge: {
          Network: {
            selectionSet: '{ id }',
            fieldName: 'networks',
            key: ({ id }) => id,
            argsFromKeys: (ids) => ({ ids }),
          },
        },
      },
      {
        schema: postsSchema,
        merge: {
          Post: {
            selectionSet: '{ id }',
            fieldName: '_posts',
            key: ({ id }) => id,
            argsFromKeys: (ids) => ({ ids }),
          },
        },
      },
    ],
  });

  it('merges associations onto abstract types', async () => {
    const { data } = await graphql({
      schema: gatewaySchema,
      source: /* GraphQL */ `
        query {
          slots(ids: [55]) {
            id
            ... on Post {
              network {
                domain
              }
            }
          }
        }
      `,
    });

    assertSome(data);
    expect(data['slots']).toEqual([
      {
        id: '55',
        network: { domain: 'network56.com' },
      },
    ]);
  });
});

// Querying a union with an alias only on one member (`... on TitleTwo { renamedText: text }`)
// used to return `renamedText: null` after stitching, even though the remote had the value.
// Aliases on abstract types must be unwrapped the same way as on concrete objects.
it('does not drop aliased fields on union types', async () => {
  const articles = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type TitleOne {
        text: String
      }
      type TitleTwo {
        text: Int
      }
      union Title = TitleOne | TitleTwo
      type Article {
        title: Title
      }
      type Query {
        articles: [Article]
      }
    `,
    resolvers: {
      Query: {
        articles: () => [
          { title: { __typename: 'TitleOne', text: 'hello world' } },
          { title: { __typename: 'TitleTwo', text: 1 } },
          { title: { __typename: 'TitleTwo', text: 2 } },
          { title: { __typename: 'TitleOne', text: 'bye' } },
        ],
      },
      Title: {
        __resolveType: (obj: { text: string | number }) =>
          typeof obj.text === 'number' ? 'TitleTwo' : 'TitleOne',
      },
    },
  });

  const gatewaySchema = stitchSchemas({
    subschemas: [articles],
  });

  const result = await graphql({
    schema: gatewaySchema,
    source: /* GraphQL */ `
      {
        articles {
          title {
            ... on TitleOne {
              text
            }
            ... on TitleTwo {
              renamedText: text
            }
          }
        }
      }
    `,
  });

  expect(result).toEqual({
    data: {
      articles: [
        { title: { text: 'hello world' } },
        { title: { renamedText: 1 } },
        { title: { renamedText: 2 } },
        { title: { text: 'bye' } },
      ],
    },
  });
});

// Two stitch layers: the inner gateway adds `newProp` by delegating back to
// `film`. An alias on that added field (`baz: newProp`) used to resolve null
// on the outer layer even though `title` aliased as `x` was fine.
it('keeps aliases on fields added by an inner stitch layer', async () => {
  const films = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Film {
        id: ID!
        title: String!
      }
      type Query {
        film(id: ID!): Film
      }
    `,
    resolvers: {
      Query: {
        film: (_root, { id }) => ({
          id,
          title: `${id} film title`,
        }),
      },
    },
  });

  const inner = stitchSchemas({
    subschemas: [films],
    typeDefs: /* GraphQL */ `
      extend type Film {
        newProp: Film
      }
    `,
    resolvers: {
      Film: {
        newProp: (_parent, _args, context, info) =>
          delegateToSchema({
            schema: films,
            fieldName: 'film',
            args: { id: 'other' },
            context,
            info,
          }),
      },
    },
  });

  const outer = stitchSchemas({
    subschemas: [inner],
  });

  const result = await graphql({
    schema: outer,
    source: /* GraphQL */ `
      {
        film(id: "1") {
          x: title
          baz: newProp {
            id
            title
          }
        }
      }
    `,
  });

  expect(result).toEqual({
    data: {
      film: {
        x: '1 film title',
        baz: {
          id: 'other',
          title: 'other film title',
        },
      },
    },
  });
});
