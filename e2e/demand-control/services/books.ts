import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const books = [
  {
    id: '1',
    title: 'The Great Gatsby',
    author: {
      name: 'F. Scott Fitzgerald',
    },
    publisher: {
      name: 'Scribner',
      address: {
        zipCode: 10001,
      },
    },
  },
  {
    id: '2',
    title: 'To Kill a Mockingbird',
    author: {
      name: 'Harper Lee',
    },
    publisher: {
      name: 'J.B. Lippincott & Co.',
      address: {
        zipCode: 19106,
      },
    },
  },
  {
    id: '3',
    title: '1984',
    author: {
      name: 'George Orwell',
    },
    publisher: {
      name: 'Secker & Warburg',
      address: {
        zipCode: 10001,
      },
    },
  },
  {
    id: '4',
    title: 'Animal Farm',
    author: {
      name: 'George Orwell',
    },
    publisher: {
      name: 'Secker & Warburg',
      address: {
        zipCode: 10001,
      },
    },
  },
  {
    id: '5',
    title: 'Brave New World',
    author: {
      name: 'Aldous Huxley',
    },
    publisher: {
      name: 'Chatto & Windus',
      address: {
        zipCode: 10001,
      },
    },
  },
];

const schema = buildSubgraphSchema({
  typeDefs: parse(/* GraphQL */ `
    type Query {
      book(id: ID): Book
      bestsellers: [Book] @listSize(assumedSize: 5)
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
      book: (_root, { id }) => books.find((book) => book.id === id),
      bestsellers: () => books,
      newestAdditions: (_root, { after, limit }) => {
        const startIndex = after
          ? books.findIndex((book) => book.id === after) + 1
          : 0;
        return books.slice(startIndex, startIndex + limit);
      },
    },
  },
});

const yoga = createYoga({
  schema,
});

const server = createServer(yoga);

const opts = Opts(process.argv);
const port = opts.getServicePort('books');

server.listen(port, () => {
  console.log(`🚀 Books service ready at http://localhost:${port}`);
});
