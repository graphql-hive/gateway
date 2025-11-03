import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import {
  composeLocalSchemasWithApollo,
  usingHiveRouterRuntime,
} from '@internal/testing';
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
          includeExtensionMetadata: true,
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
          includeExtensionMetadata: true,
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
          includeExtensionMetadata: true,
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
          includeExtensionMetadata: true,
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
          maxCost: 3,
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
      ...(usingHiveRouterRuntime()
        ? {
            // data field completely omitted on errors from hive router qp
          }
        : { data: { book: null } }),
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
          ...(usingHiveRouterRuntime()
            ? {
                // path and locations not present in hive router qp
              }
            : {
                locations: [
                  {
                    line: 3,
                    column: 9,
                  },
                ],
                path: ['book'],
              }),
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
          includeExtensionMetadata: true,
          listSize: 5,
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

  it('@listSize(slicingArguments:, requireOneSlicingArgument:true)', async () => {
    const itemsSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: ["@listSize"]
          ) {
          query: Query
        }

        type Query {
          items(first: Int, last: Int): [Item!]
            @listSize(slicingArguments: ["first", "last"])
        }

        type Item {
          id: ID
        }
      `),
      resolvers: {
        Query: {
          items: () => [{ id: 'Item 1' }, { id: 'Item 2' }],
        },
      },
    });
    await using itemsServer = createYoga({
      schema: itemsSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'items',
          schema: itemsSubgraph,
          url: 'http://items/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(itemsServer.fetch),
        useDemandControl({
          includeExtensionMetadata: true,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query ItemsQuery {
        items(first: 2, last: 3) {
          id
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
      ...(usingHiveRouterRuntime()
        ? {
            // data field completely omitted on errors from hive router qp
          }
        : {
            data: {
              items: null,
            },
          }),
      errors: [
        {
          message:
            'Only one slicing argument is allowed on field "items"; found multiple slicing arguments "first, last"',
          extensions: {
            code: 'COST_QUERY_PARSE_FAILURE',
          },
          ...(usingHiveRouterRuntime()
            ? {
                // path and locations not present in hive router qp
              }
            : {
                locations: [
                  {
                    line: 3,
                    column: 9,
                  },
                ],
                path: ['items'],
              }),
        },
      ],
      extensions: {
        cost: {
          estimated: 0,
        },
      },
    });
  });
  it('@listSize(slicingArguments:, requireOneSlicingArgument:false)', async () => {
    const itemsSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: ["@listSize"]
          ) {
          query: Query
        }

        type Query {
          items(first: Int, last: Int): [Item!]
            @listSize(
              slicingArguments: ["first", "last"]
              requireOneSlicingArgument: false
            )
        }

        type Item {
          id: ID
        }
      `),
      resolvers: {
        Query: {
          items: () => [{ id: 'Item 1' }, { id: 'Item 2' }],
        },
      },
    });
    await using itemsServer = createYoga({
      schema: itemsSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'items',
          schema: itemsSubgraph,
          url: 'http://items/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(itemsServer.fetch),
        useDemandControl({
          includeExtensionMetadata: true,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query ItemsQuery {
        items(first: 2, last: 3) {
          id
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
        items: [{ id: 'Item 1' }, { id: 'Item 2' }],
      },
      extensions: {
        cost: {
          estimated: 3,
        },
      },
    });
  });
  it('@listSize(sizedFields:)', async () => {
    const itemsSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: ["@listSize"]
          ) {
          query: Query
        }

        type Query {
          items(first: Int): Cursor!
            @listSize(slicingArguments: ["first"], sizedFields: ["page"])
        }

        type Cursor {
          page: [Item!]
          nextPageToken: String
        }

        type Item {
          id: ID
        }
      `),
      resolvers: {
        Query: {
          items: () => ({
            page: [{ id: 'Item 1' }, { id: 'Item 2' }],
            nextPageToken: 'token',
          }),
        },
      },
    });
    await using itemsServer = createYoga({
      schema: itemsSubgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'items',
          schema: itemsSubgraph,
          url: 'http://items/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(itemsServer.fetch),
        useDemandControl({
          includeExtensionMetadata: true,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query ItemsQuery {
        items(first: 5) {
          page {
            id
          }
          nextPageToken
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
        items: {
          page: [{ id: 'Item 1' }, { id: 'Item 2' }],
          nextPageToken: 'token',
        },
      },
      extensions: {
        cost: {
          estimated: 6,
        },
      },
    });
  });

  /**
   * 1 Query (0) + 1 book object (1) + 1 author object (1) + 1 publisher object (1) + 1 address object (5) = 8 total cost
   */
  it('@cost in object but aliased as @myCost', async () => {
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

        type Address @myCost(weight: 5) {
          zipCode: Int!
        }
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.9"
            import: [{ name: "@cost", as: "@myCost" }]
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
          includeExtensionMetadata: true,
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

  it('returns cost even if it does not hit the subgraph', async () => {
    const subgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          foo: String
        }
      `),
    });
    await using subgraphServer = createYoga({
      schema: subgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'subgraph',
          schema: subgraph,
          url: 'http://subgraph/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(subgraphServer.fetch),
        useDemandControl({
          includeExtensionMetadata: true,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query EmptyQuery {
        __typename
        a: __typename
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
        __typename: 'Query',
        a: 'Query',
      },
      extensions: {
        cost: {
          estimated: 0,
        },
      },
    });
  });

  it('handles batched requests', async () => {
    const subgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          foo: Foo
          bar: Bar
        }

        type Foo {
          id: ID
        }

        type Bar {
          id: ID
        }
      `),
      resolvers: {
        Query: {
          foo: async () => ({ id: 'foo' }),
          bar: async () => ({ id: 'bar' }),
        },
      },
    });
    await using subgraphServer = createYoga({
      schema: subgraph,
    });
    await using gateway = createGatewayRuntime({
      supergraph: await composeLocalSchemasWithApollo([
        {
          name: 'subgraph',
          schema: subgraph,
          url: 'http://subgraph/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        useCustomFetch(subgraphServer.fetch),
        useDemandControl({
          includeExtensionMetadata: true,
          maxCost: 1,
        }),
      ],
    });
    const query = /* GraphQL */ `
      query FooQuery {
        foo {
          id
        }
        bar {
          id
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
      ...(usingHiveRouterRuntime()
        ? {
            // data field completely omitted on errors from hive router qp
          }
        : {
            data: {
              foo: null,
              bar: null,
            },
          }),
      errors: usingHiveRouterRuntime()
        ? [
            // only one error because there are no locations or paths in hive router qp
            {
              extensions: {
                code: 'COST_ESTIMATED_TOO_EXPENSIVE',
                cost: {
                  estimated: 2,
                  max: 1,
                },
              },
              message:
                'Operation estimated cost 2 exceeded configured maximum 1',
            },
          ]
        : [
            {
              extensions: {
                code: 'COST_ESTIMATED_TOO_EXPENSIVE',
                cost: {
                  estimated: 2,
                  max: 1,
                },
              },
              locations: [
                {
                  column: 9,
                  line: 3,
                },
              ],
              message:
                'Operation estimated cost 2 exceeded configured maximum 1',
              path: ['foo'],
            },
            {
              extensions: {
                code: 'COST_ESTIMATED_TOO_EXPENSIVE',
                cost: {
                  estimated: 2,
                  max: 1,
                },
              },
              locations: [
                {
                  column: 9,
                  line: 6,
                },
              ],
              message:
                'Operation estimated cost 2 exceeded configured maximum 1',
              path: ['bar'],
            },
          ],
      extensions: {
        cost: {
          estimated: 2,
          max: 1,
        },
      },
    });
  });
});
