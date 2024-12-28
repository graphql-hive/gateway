import { createServer } from 'http';
import { fetch } from '@whatwg-node/fetch';
import { createRouter, Response } from 'fets';

const todos: unknown[] = [];

const app = createRouter()
  .route({
    path: '/todos',
    method: 'GET',
    handler: () => Response.json(todos),
  })
  .route({
    path: '/todo',
    method: 'POST',
    // @ts-expect-error TODO: something's wrong with fets types
    async handler(request, { waitUntil }) {
      const reqBody = await request.json();
      const todo = {
        id: todos.length,
        ...reqBody,
      };
      todos.push(todo);
      waitUntil(
        fetch(`http://0.0.0.0:${opts.getPort(true)}/webhooks/todo_added`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(todo),
        })
          .then((res) =>
            res.text().then((resText) =>
              console.log('Webhook payload sent', {
                status: res.status,
                statusText: res.statusText,
                body: resText,
                headers: Object.fromEntries(res.headers.entries()),
              }),
            ),
          )
          .catch((err) => console.error('Webhook payload failed', err)),
      );
      return Response.json(todo);
    },
  });

const port = 4001;

createServer(app).listen(port, () => {
  console.log(`API service listening on http://localhost:${port}`);
});
