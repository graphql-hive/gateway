import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { ReadableStream } from '@whatwg-node/fetch';
import { createRouter, Response } from 'fets';
import { getSdk } from './generated';

const supergraphPath = join(__dirname, '../../supergraph.graphql');

const runtime = createGatewayRuntime({
  supergraph: readFileSync(supergraphPath, 'utf-8'),
});

const sdk = getSdk(runtime.sdkRequester);

const port = 4002;

createServer(
  createRouter()
    .route({
      path: '/query',
      async handler() {
        const todos = await sdk.Todos();
        return Response.json(todos);
      },
    })
    .route({
      path: '/mutation',
      async handler() {
        const addTodos = await sdk.AddTodo({
          text: 'Write tests',
        });
        return Response.json(addTodos);
      },
    })
    .route({
      path: '/subscription',
      async handler() {
        let pingInterval: ReturnType<typeof setInterval> | null = null;
        let iterator: AsyncIterator<unknown> | null = null;
        return new Response(
          new ReadableStream({
            start(controller) {
              const startFn = async () => {
                try {
                  // Send a ping every second to keep the connection alive
                  pingInterval = setInterval(() => {
                    controller.enqueue(
                      Buffer.from(
                        `event: ping\ndata: { "time": ${Date.now()} } \n\n`,
                      ),
                    );
                  }, 1000);
                  const iterable = sdk.TodoAdded();
                  iterator = iterable[Symbol.asyncIterator]();
                  while (true) {
                    const { value: result, done } = await iterator.next();
                    if (done) {
                      break;
                    }
                    console.log('Received subscription result:', result);
                    controller.enqueue(
                      Buffer.from(
                        `event: message\ndata: ${JSON.stringify(result)}\n\n`,
                      ),
                    );
                    console.log('Enqueued subscription result to stream');
                  }
                  controller.close();
                } catch (error) {
                  console.error('Error in subscription handler:', error);
                  controller.error(error);
                } finally {
                  if (pingInterval) {
                    clearInterval(pingInterval);
                  }
                }
              };
              startFn();
            },
            cancel() {
              if (pingInterval) {
                clearInterval(pingInterval);
              }
              // Stop the underlying GraphQL subscription so the upstream
              // execution doesn't keep running after the client disconnects.
              if (iterator?.return) {
                iterator.return();
              }
            },
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          },
        );
      },
    }),
).listen(port, () => {
  console.log(`SDK service is running on port ${port}`);
});
