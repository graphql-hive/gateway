import { createServer } from 'node:http';
import { Opts } from '@internal/testing';
import { createRouter, Response, Static, Type } from 'fets';

let requestCount = 0;

const User = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
  },
  { title: 'User' },
);

const users: Static<typeof User>[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' },
];

export const router = createRouter()
  .route({
    path: '/users',
    method: 'GET',
    operationId: 'users',
    schemas: {
      responses: {
        200: Type.Array(User),
        503: Type.Unknown(),
        429: Type.Unknown(),
      },
    },
    handler() {
      requestCount++;
      if (requestCount === 1) {
        return new Response(null, { status: 503 });
      }
      if (requestCount === 2) {
        return new Response(null, {
          status: 429,
          headers: { 'retry-after': '1' },
        });
      }
      return Response.json(users);
    },
  })
  .route({
    path: '/users/:id',
    method: 'GET',
    operationId: 'user',
    schemas: {
      request: {
        params: Type.Object({
          id: Type.String(),
        }),
      },
      responses: {
        200: User,
        404: Type.Object({
          message: Type.String(),
        }),
      },
    },
    handler(req) {
      const user = users.find((user) => user.id === req.params.id);
      if (!user) {
        return Response.json({ message: 'User not found' }, { status: 404 });
      }
      return Response.json(user);
    },
  });

const opts = Opts(process.argv);
const PORT = opts.getServicePort('oai-flakey');
createServer(router).listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`),
);
