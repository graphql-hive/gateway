import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { useDemandControl } from '../src/plugins/useDemandControl';

describe('Demand Control', () => {
  const book = {
    title: 'The Great Gatsby',
    author: {
      name: 'F. Scott Fitzgerald',
    },
    publisher: {
      name: 'Scribner',
      address: {
        zipCode: 10019,
      },
    },
  };
  /**
   * 1 Query (0) + 1 book object (1) + 1 author object (1) + 1 publisher object (1) + 1 address object (1) = 4 total cost
   */
  it('basic query', async () => {
    const booksSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          book(id: ID): Book
        }

        type Book {
          title: String
          author: Author
          publisher: Publisher
        }

        type Author {
          name: String
        }

        type Publisher {
          name: String
          address: Address
        }

        type Address {
          zipCode: Int!
        }
      `),
      resolvers: {
        Query: {
          book: (_root, { id }) => {
            if (id === '1') {
              return book;
            }
            throw new Error('Book not found');
          },
        },
      },
    });
    await using booksServer = createYoga({
      schema: booksSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'books',
          schema: booksSubgraph,
          url: 'http://books/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(booksServer.fetch),
        useDemandControl({
          showInformationInExtensions: true,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query BookQuery {
        book(id: 1) {
          title
          author {
            name
          }
          publisher {
            name
            address {
              zipCode
            }
          }
        }
      }
    `;
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        book,
      },
      extensions: {
        cost: {
          estimated: 4,
        },
      },
    });
  });
  /**
   * 1 Query (0) + 1 book object (1) + 1 author object (1) + 1 publisher object (1) + 1 address object (5) = 8 total cost
   */
  it('@cost in object', async () => {
    const booksSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          book(id: ID): Book
        }

        type Book {
          title: String
          author: Author
          publisher: Publisher
        }

        type Author {
          name: String
        }

        type Publisher {
          name: String
          address: Address
        }

        type Address @cost(weight: 5) {
          zipCode: Int!
        }
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: ["@cost"]
          ) {
          query: Query
        }
      `),
      resolvers: {
        Query: {
          book: (_root, { id }) => {
            if (id === '1') {
              return book;
            }
            throw new Error('Book not found');
          },
        },
      },
    });
    await using booksServer = createYoga({
      schema: booksSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'books',
          schema: booksSubgraph,
          url: 'http://books/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(booksServer.fetch),
        useDemandControl({
          showInformationInExtensions: true,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query BookQuery {
        book(id: 1) {
          title
          author {
            name
          }
          publisher {
            name
            address {
              zipCode
            }
          }
        }
      }
    `;
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        book,
      },
      extensions: {
        cost: {
          estimated: 8,
        },
      },
    });
  });
  /**
   * 1 Query (0) + 5 book objects (5 * (1 book object (1) + 1 author object (1) + 1 publisher object (1) + 1 address object (5))) = 40 total cost
   */
  it('@listSize(assumedSize:)', async () => {
    const booksSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          bestsellers: [Book] @listSize(assumedSize: 5)
        }

        type Book {
          title: String
          author: Author
          publisher: Publisher
        }

        type Author {
          name: String
        }

        type Publisher {
          name: String
          address: Address
        }

        type Address @cost(weight: 5) {
          zipCode: Int!
        }
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: ["@cost", "@listSize"]
          ) {
          query: Query
        }
      `),
      resolvers: {
        Query: {
          book: (_root, { id }) => {
            if (id === '1') {
              return book;
            }
            throw new Error('Book not found');
          },
          bestsellers: () => [book],
        },
      },
    });
    await using booksServer = createYoga({
      schema: booksSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'books',
          schema: booksSubgraph,
          url: 'http://books/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(booksServer.fetch),
        useDemandControl({
          showInformationInExtensions: true,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query BestsellersQuery {
        bestsellers {
          title
          author {
            name
          }
          publisher {
            name
            address {
              zipCode
            }
          }
        }
      }
    `;
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        bestsellers: [book],
      },
      extensions: {
        cost: {
          estimated: 40,
        },
      },
    });
  });
  /**
   * When requesting 3 books:
   * 1 Query (0) + 3 book objects (3 * (1 book object (1) + 1 author object (1) + 1 publisher object (1) + 1 address object (5))) = 24 total cost
   *
   * When requesting 7 books:
   * 1 Query (0) + 3 book objects (7 * (1 book object (1) + 1 author object (1) + 1 publisher object (1) + 1 address object (5))) = 56 total cost
   */
  it('@listSize(slicingArguments:)', async () => {
    const booksSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          newestAdditions(after: ID, limit: Int!): [Book]
            @listSize(slicingArguments: ["limit"])
        }

        type Book {
          title: String
          author: Author
          publisher: Publisher
        }

        type Author {
          name: String
        }

        type Publisher {
          name: String
          address: Address
        }

        type Address @cost(weight: 5) {
          zipCode: Int!
        }
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: ["@cost", "@listSize"]
          ) {
          query: Query
        }
      `),
      resolvers: {
        Query: {
          book: (_root, { id }) => {
            if (id === '1') {
              return book;
            }
            throw new Error('Book not found');
          },
          bestsellers: () => [book],
          newestAdditions: () => [book],
        },
      },
    });
    await using booksServer = createYoga({
      schema: booksSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'books',
          schema: booksSubgraph,
          url: 'http://books/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(booksServer.fetch),
        useDemandControl({
          showInformationInExtensions: true,
        }),
      ],
    });
    /* Querying 3 books start */
    const queryWith3 = /* GraphQL */ `
      query NewestAdditions {
        newestAdditions(limit: 3) {
          title
          author {
            name
          }
          publisher {
            name
            address {
              zipCode
            }
          }
        }
      }
    `;
    const responseWith3 = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: queryWith3 }),
    });
    const resultWith3 = await responseWith3.json();
    expect(resultWith3).toEqual({
      data: {
        newestAdditions: [book],
      },
      extensions: {
        cost: {
          estimated: 24,
        },
      },
    });
    /* Querying 3 books end */
    /* Querying 7 books start */
    const queryWith7 = /* GraphQL */ `
      query NewestAdditions {
        newestAdditions(limit: 7) {
          title
          author {
            name
          }
          publisher {
            name
            address {
              zipCode
            }
          }
        }
      }
    `;
    const responseWith7 = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: queryWith7 }),
    });
    const resultWith7 = await responseWith7.json();
    expect(resultWith7).toEqual({
      data: {
        newestAdditions: [book],
      },
      extensions: {
        cost: {
          estimated: 56,
        },
      },
    });
    /* Querying 7 books end */
  });

  it('"max" option', async () => {
    const booksSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          book(id: ID): Book
        }

        type Book {
          title: String
          author: Author
          publisher: Publisher
        }

        type Author {
          name: String
        }

        type Publisher {
          name: String
          address: Address
        }

        type Address {
          zipCode: Int!
        }
      `),
      resolvers: {
        Query: {
          book: (_root, { id }) => {
            if (id === '1') {
              return book;
            }
            throw new Error('Book not found');
          },
        },
      },
    });
    await using booksServer = createYoga({
      schema: booksSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'books',
          schema: booksSubgraph,
          url: 'http://books/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(booksServer.fetch),
        useDemandControl({
          max: 3,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query BookQuery {
        book(id: 1) {
          title
          author {
            name
          }
          publisher {
            name
            address {
              zipCode
            }
          }
        }
      }
    `;
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        book: null,
      },
      errors: [
        {
          message: 'Operation estimated cost 4 exceeded configured maximum 3',
          extensions: {
            code: 'COST_ESTIMATED_TOO_EXPENSIVE',
            cost: {
              estimated: 4,
              max: 3,
            },
          },
          locations: [
            {
              line: 3,
              column: 9,
            },
          ],
          path: ['book'],
        },
      ],
    });
  });

  it('"defaultAssumedListSize" option', async () => {
    const booksSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          bestsellers: [Book]
        }

        type Book {
          title: String
          author: Author
          publisher: Publisher
        }

        type Author {
          name: String
        }

        type Publisher {
          name: String
          address: Address
        }

        type Address @cost(weight: 5) {
          zipCode: Int!
        }
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: ["@cost"]
          ) {
          query: Query
        }
      `),
      resolvers: {
        Query: {
          book: (_root, { id }) => {
            if (id === '1') {
              return book;
            }
            throw new Error('Book not found');
          },
          bestsellers: () => [book],
        },
      },
    });
    await using booksServer = createYoga({
      schema: booksSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'books',
          schema: booksSubgraph,
          url: 'http://books/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(booksServer.fetch),
        useDemandControl({
          showInformationInExtensions: true,
          defaultAssumedListSize: 5,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query BestsellersQuery {
        bestsellers {
          title
          author {
            name
          }
          publisher {
            name
            address {
              zipCode
            }
          }
        }
      }
    `;
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        bestsellers: [book],
      },
      extensions: {
        cost: {
          estimated: 40,
        },
      },
    });
  });
});
