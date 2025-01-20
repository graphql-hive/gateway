import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createRouter, Response, Type } from 'fets';
import { authors } from './data';

const opts = Opts(process.argv);
const port = opts.getServicePort('authors');

const Author = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
  },
  { title: 'Author' },
);

createServer(
  createRouter()
    .route({
      operationId: 'get_authors',
      method: 'GET',
      path: '/authors',
      schemas: {
        responses: {
          200: Type.Array(Author),
        },
      },
      handler: () => Response.json(authors),
    })
    .route({
      operationId: 'get_author',
      method: 'GET',
      path: '/authors/:author_id',
      schemas: {
        request: {
          params: Type.Object({
            author_id: Type.String(),
          }),
        },
        responses: {
          200: Author,
          404: Type.Object({
            message: Type.String(),
          }),
        },
      },
      handler: ({ params }) => {
        const author = authors.find((author) => author.id === params.author_id);
        if (!author) {
          return Response.json(
            {
              message: 'Author not found',
            },
            {
              status: 404,
            },
          );
        }
        return Response.json(author);
      },
    }),
).listen(port);
