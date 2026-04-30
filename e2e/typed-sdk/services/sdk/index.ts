import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { Opts } from '@internal/testing';
import { ReadableStream } from '@whatwg-node/fetch';
import { createRouter, Response } from 'fets';
import { getSdk } from './generated';

const supergraphPath =
  process.env['SUPERGRAPH_PATH'] || join(__dirname, '../../supergraph.graphql');

const runtime = createGatewayRuntime({
  supergraph: readFileSync(supergraphPath, 'utf-8'),
});

const sdk = getSdk(runtime.sdkRequester);

const port = Opts(process.argv).getServicePort('sdk');

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
                  for await (const result of sdk.TodoAdded()) {
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
