import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('propagates headers to subgraphs', async () => {
  const gw = await gateway({
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

it('propagates headers to subgraphs with batching', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('upstream')],
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
