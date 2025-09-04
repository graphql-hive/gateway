import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('should retry properly with a graphql upstream service', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('gql-flakey'), await service('oai-flakey')],
    },
  });

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        query {
          product(id: "1") {
            id
            name
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "product": {
          "id": "1",
          "name": "Product 1",
        },
      },
    }
  `);

  const logs = gw.getStd('both');

  // 1st will time out
  // 2nd will with 429 too early retry
  // 3rd will fail with 504
  // 4th will succeed
  expect(logs.match(/\[FETCHING\]/g)?.length).toBeLessThanOrEqual(4);
});

it('should retry properly with an openapi upstream service', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('gql-flakey'), await service('oai-flakey')],
    },
  });

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        query {
          users {
            id
            name
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "users": [
          {
            "id": "1",
            "name": "Alice",
          },
          {
            "id": "2",
            "name": "Bob",
          },
          {
            "id": "3",
            "name": "Charlie",
          },
        ],
      },
    }
  `);

  const logs = gw.getStd('both');

  // 1st will fail with 503
  // 2nd will with 429 too early retry
  // 3rd will succeed
  expect(logs.match(/\[FETCHING\]/g)?.length).toBe(3);
});

it('should retry properly with an openapi upstream service when deduplicating requests', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('gql-flakey'), await service('oai-flakey')],
    },
    env: {
      DEDUPLICATE_REQUEST: 1,
    },
  });

  await expect(
    Promise.all(
      [...Array(3)].map(() =>
        gw.execute({
          query: /* GraphQL */ `
            query {
              users {
                id
                name
              }
            }
          `,
        }),
      ),
    ),
  ).resolves.toMatchInlineSnapshot(`
    [
      {
        "data": {
          "users": [
            {
              "id": "1",
              "name": "Alice",
            },
            {
              "id": "2",
              "name": "Bob",
            },
            {
              "id": "3",
              "name": "Charlie",
            },
          ],
        },
      },
      {
        "data": {
          "users": [
            {
              "id": "1",
              "name": "Alice",
            },
            {
              "id": "2",
              "name": "Bob",
            },
            {
              "id": "3",
              "name": "Charlie",
            },
          ],
        },
      },
      {
        "data": {
          "users": [
            {
              "id": "1",
              "name": "Alice",
            },
            {
              "id": "2",
              "name": "Bob",
            },
            {
              "id": "3",
              "name": "Charlie",
            },
          ],
        },
      },
    ]
  `);

  const logs = gw.getStd('both');

  // 1st will fail with 503
  // 2nd will with 429 too early retry
  // 3rd will succeed, first out of 3 requests
  // 4th second out of 3 requests
  // 5th third out of 3 requests
  // 5 because we dont deduplicate failing requests
  expect(logs.match(/\[FETCHING\]/g)?.length).toBe(5);
});
