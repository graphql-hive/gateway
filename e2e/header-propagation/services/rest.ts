import { createServer } from 'node:http';
import { Opts } from '@internal/testing';
import { createRouter, Response, Type } from 'fets';

const opts = Opts(process.argv);
const PORT = opts.getServicePort('rest');

createServer(
  createRouter().route({
    operationId: 'headers',
    method: 'GET',
    path: '/headers',
    schemas: {
      request: {
        headers: Type.Object({
          authorization: Type.Optional(Type.String()),
          'session-cookie-id': Type.Optional(Type.String()),
        }),
      },
      responses: {
        200: Type.Object({
          authorization: Type.Optional(Type.String()),
          sessionCookieId: Type.Optional(Type.String()),
        }),
      },
    },
    handler(req) {
      return Response.json({
        authorization: req.headers.get('authorization') ?? undefined,
        sessionCookieId: req.headers.get('session-cookie-id') ?? undefined,
      });
    },
  }),
).listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}/headers`);
});
