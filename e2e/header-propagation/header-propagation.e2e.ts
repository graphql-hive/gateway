import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('propagates headers to subgraphs', async () => {
  await using gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('upstream')],
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

it('sends default headers to subgraphs', async () => {
  await using gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('upstream')],
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
