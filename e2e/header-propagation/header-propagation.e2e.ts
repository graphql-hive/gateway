import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

const combinations = [
  {
    composeWith: 'apollo',
    subgraphName: 'upstream',
  },
  {
    composeWith: 'mesh',
    subgraphName: 'rest',
  },
] as const;

for (const { subgraphName, composeWith } of combinations) {
  describe(`Header propagation with ${subgraphName}`, () => {
    it('propagates headers to subgraphs', async () => {
      const gw = await gateway({
        supergraph: {
          with: composeWith,
          services: [await service(subgraphName)],
        },
      });
      const result = await gw.execute({
        query: /* GraphQL */ `
          query {
            headers {
              authorization
              sessionCookieId
            }
          }
        `,
        headers: {
          authorization: 'Bearer token',
          'session-cookie-id': 'session-cookie',
        },
      });
      expect(result).toEqual({
        data: {
          headers: {
            authorization: 'Bearer token',
            sessionCookieId: 'session-cookie',
          },
        },
      });
    });

    it('propagates headers to subgraphs with batching', async () => {
      const gw = await gateway({
        supergraph: {
          with: composeWith,
          services: [await service(subgraphName)],
        },
      });
      const result = await gw.execute({
        query: /* GraphQL */ `
          query {
            h1: headers {
              sessionCookieId
            }
            h2: headers {
              authorization
            }
          }
        `,
        headers: {
          authorization: 'Bearer token',
          'session-cookie-id': 'session-cookie',
        },
      });
      expect(result).toEqual({
        data: {
          h1: {
            sessionCookieId: 'session-cookie',
          },
          h2: {
            authorization: 'Bearer token',
          },
        },
      });
    });

    it('sends default headers to subgraphs', async () => {
      const gw = await gateway({
        supergraph: {
          with: composeWith,
          services: [await service(subgraphName)],
        },
      });
      const result = await gw.execute({
        query: /* GraphQL */ `
          query {
            headers {
              authorization
              sessionCookieId
            }
          }
        `,
      });
      expect(result).toEqual({
        data: {
          headers: {
            authorization: 'default',
            sessionCookieId: 'default',
          },
        },
      });
    });
  });
}
