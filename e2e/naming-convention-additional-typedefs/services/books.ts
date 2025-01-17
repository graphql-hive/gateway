import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createRouter, Response, Type } from 'fets';
import { books } from './data';

const opts = Opts(process.argv);
const port = opts.getServicePort('books');

const Book = Type.Object(
  {
    id: Type.String(),
    title: Type.String(),
    author_id: Type.String(),
  },
  { title: 'Book' },
);

createServer(
  createRouter()
    .route({
      operationId: 'get_books',
      method: 'GET',
      path: '/books',
      schemas: {
        responses: {
          200: Type.Array(Book),
        },
      },
      handler: () => Response.json(books),
    })
    .route({
      operationId: 'get_book',
      method: 'GET',
      path: '/books/:book_id',
      schemas: {
        request: {
          params: Type.Object({
            book_id: Type.String(),
          }),
        },
        responses: {
          200: Book,
          404: Type.Object({
            message: Type.String(),
          }),
        },
      },
      handler: ({ params }) => {
        const book = books.find((book) => book.id === params.book_id);
        if (!book) {
          return Response.json(
            {
              message: 'Book not found',
            },
            {
              status: 404,
            },
          );
        }
        return Response.json(book);
      },
    }),
).listen(port);
