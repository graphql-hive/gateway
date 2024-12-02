import fs from 'node:fs/promises';
import path from 'node:path';
import { createTenv, getAvailablePort, waitForPort } from '@internal/e2e';
import { isDebug } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { expect, it } from 'vitest';

const { spawn, gatewayRunner, service, composeWithMesh } =
  createTenv(__dirname);

async function wrangler() {
  const port = await getAvailablePort();
  const [proc] = await spawn('yarn wrangler', {
    args: [
      'dev',
      '--port',
      port.toString(),
      ...(isDebug() ? ['--var', 'DEBUG:1'] : []),
    ],
  });
  const signal = AbortSignal.timeout(3_000);
  await waitForPort(port, signal);
  return {
    proc,
    url: `http://0.0.0.0:${port}`,
    async execute({
      query,
      headers,
    }: {
      query: string;
      headers?: HeadersInit;
    }): Promise<ExecutionResult> {
      const r = await fetch(`http://0.0.0.0:${port}/graphql`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ query }),
      });
      return r.json();
    },
  };
}

it.skipIf(gatewayRunner !== 'node')('should execute', async () => {
  const { output: supergraph } = await composeWithMesh({
    output: 'ts',
    services: [
      await service('accounts'),
      await service('inventory'),
      await service('products'),
      await service('reviews'),
    ],
  });

  await fs.copyFile(supergraph, path.join(__dirname, 'src', 'supergraph.ts'));

  const { execute } = await wrangler();

  await expect(
    execute({
      query: /* GraphQL */ `
        fragment User on User {
          id
          username
          name
        }

        fragment Review on Review {
          id
          body
        }

        fragment Product on Product {
          inStock
          name
          price
          shippingEstimate
          upc
          weight
        }

        query TestQuery {
          users {
            ...User
            reviews {
              ...Review
              product {
                ...Product
                reviews {
                  ...Review
                  author {
                    ...User
                    reviews {
                      ...Review
                      product {
                        ...Product
                      }
                    }
                  }
                }
              }
            }
          }
          topProducts {
            ...Product
            reviews {
              ...Review
              author {
                ...User
                reviews {
                  ...Review
                  product {
                    ...Product
                  }
                }
              }
            }
          }
        }
      `,
    }),
  ).resolves.toMatchSnapshot();
});
