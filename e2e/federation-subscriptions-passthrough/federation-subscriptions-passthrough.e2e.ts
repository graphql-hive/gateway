import { setTimeout } from 'timers/promises';
import { createTenv, getAvailablePort } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import {
  createClient as createSSEClient,
  type Client as SSEClient,
  type ClientOptions as SSEClientOptions,
} from 'graphql-sse';
import {
  createClient as createWSClient,
  type Client as WSClient,
  type ClientOptions as WSClientOptions,
} from 'graphql-ws';
import { describe, expect, it } from 'vitest';
import webSocketImpl from 'ws';
import { TOKEN } from './services/products/server';

const { service, gateway, gatewayRunner } = createTenv(__dirname);

const subscriptionsClientFactories = [
  ['SSE', createSSEClient],
  ['WS', createWSClient],
] as [
  string,
  (
    opts: Partial<SSEClientOptions> & Partial<WSClientOptions>,
  ) => SSEClient | WSClient,
][];

subscriptionsClientFactories.forEach(([protocol, createClient]) => {
  describe(`with ${protocol}`, () => {
    if (protocol === 'WS' && process.version.startsWith('v18')) {
      it.skip(
        'WebSocket tests are skipped on Node.js v18 due to a bug in the WebSocket implementation',
      );
      return;
    }
    if (gatewayRunner === 'bun-docker') {
      it.skip('WebSocket tests are skipped on bun-docker runner');
      return;
    }
    const headers = {
      authorization: TOKEN,
    };
    it('should subscribe and resolve via websockets', async () => {
      const { port } = await gateway({
        supergraph: {
          with: 'apollo',
          services: [await service('products'), await service('reviews')],
        },
      });

      const client = createClient({
        url: `http://0.0.0.0:${port}/graphql`,
        retryAttempts: 0,
        headers,
        connectionParams: headers,
        fetchFn: fetch,
        webSocketImpl,
      });

      const sub = client.iterate({
        query: /* GraphQL */ `
          subscription OnProductPriceChanged {
            productPriceChanged {
              # Defined in Products subgraph
              name
              price
              reviews {
                # Defined in Reviews subgraph
                score
              }
            }
          }
        `,
      });

      const msgs = [];
      for await (const msg of sub) {
        msgs.push(msg);
        if (msgs.length >= 3) {
          break;
        }
      }

      expect(msgs).toEqual([
        {
          data: {
            productPriceChanged: {
              name: 'Table',
              price: 1798,
              reviews: [
                {
                  score: 10,
                },
                {
                  score: 10,
                },
              ],
            },
          },
        },
        {
          data: {
            productPriceChanged: {
              name: 'Couch',
              price: 2598,
              reviews: [
                {
                  score: 10,
                },
              ],
            },
          },
        },
        {
          data: {
            productPriceChanged: {
              name: 'Chair',
              price: 108,
              reviews: [
                {
                  score: 10,
                },
              ],
            },
          },
        },
      ]);
    });

    it('should recycle websocket connections', async () => {
      const { port } = await gateway({
        supergraph: {
          with: 'apollo',
          services: [await service('products'), await service('reviews')],
        },
      });

      const client = createClient({
        url: `http://0.0.0.0:${port}/graphql`,
        retryAttempts: 0,
        headers,
        connectionParams: headers,
        fetchFn: fetch,
        webSocketImpl,
      });

      const query = /* GraphQL */ `
        subscription OnProductPriceChanged {
          productPriceChanged {
            price
          }
        }
      `;
      for (let i = 0; i < 5; i++) {
        // connect
        for await (const msg of client.iterate({ query })) {
          expect(msg).toMatchObject({
            data: expect.any(Object),
          });
          break; // complete subscription on first received message
        }
        // disconnect

        await setTimeout(300); // wait a bit and subscribe again (lazyCloseTimeout is 3 seconds)
      }

      // the "products" service will crash if multiple websockets were connected breaking the loop above with an error
    });

    it('should subscribe and resolve via http callbacks', async () => {
      // Get a random available port
      const availablePort = await getAvailablePort();

      const publicUrl = `http://0.0.0.0:${availablePort}`;
      await gateway({
        supergraph: {
          with: 'apollo',
          services: [await service('products'), await service('reviews')],
        },
        port: availablePort,
        env: {
          PUBLIC_URL: publicUrl + '/callback',
        },
      });

      const client = createClient({
        url: `${publicUrl}/graphql`,
        retryAttempts: 0,
        fetchFn: fetch,
        webSocketImpl,
      });

      const sub = client.iterate({
        query: /* GraphQL */ `
          subscription CountDown {
            countdown(from: 4)
          }
        `,
      });

      const msgs = [];
      for await (const msg of sub) {
        expect(msg).toMatchObject({
          data: expect.any(Object),
        });
        msgs.push(msg);
        if (msgs.length >= 4) {
          break;
        }
      }

      expect(msgs).toMatchObject([
        {
          data: {
            countdown: 4,
          },
        },
        {
          data: {
            countdown: 3,
          },
        },
        {
          data: {
            countdown: 2,
          },
        },
        {
          data: {
            countdown: 1,
          },
        },
      ]);
    });
  });
});
