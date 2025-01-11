import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should allow checking registration but disallow "me" when not authenticated', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('users')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          registrationOpen
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "registrationOpen": false,
      },
    }
  `);

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          me {
            name
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": null,
      "errors": [
        {
          "locations": [
            {
              "column": 11,
              "line": 3,
            },
          ],
          "message": "Insufficient permissions for selecting 'Query.me'.",
        },
        {
          "locations": [
            {
              "column": 13,
              "line": 4,
            },
          ],
          "message": "Insufficient permissions for selecting 'User.name'.",
        },
      ],
    }
  `);
});

it('should allow "me" when authenticated', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('users')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          registrationOpen
          me {
            name
          }
        }
      `,
      headers: {
        authorization: 'Bearer TOKEN',
      },
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "me": {
          "name": "John",
        },
        "registrationOpen": false,
      },
    }
  `);
});
