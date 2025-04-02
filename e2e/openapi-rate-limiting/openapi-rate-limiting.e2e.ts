import { setTimeout } from 'timers/promises';
import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should rate limit requests', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('users')],
    },
  });

  const query = /* GraphQL */ `
    {
      users {
        id
      }
    }
  `;

  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      // calmdown before testing rate limits again
      await setTimeout(2_000);
    }

    // first 5 requests should not be rate limited
    for (let j = 0; j < 5; j++) {
      await expect(execute({ query })).resolves.toEqual({
        data: expect.any(Object),
      });
    }

    // subsequent requests are rate limited
    for (let j = 0; j < 5; j++) {
      await expect(execute({ query })).resolves.toEqual({
        data: {
          users: null,
        },
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: 'Rate limit of "Query.users" exceeded for "anonymous"',
          }),
        ]),
      });
    }
  }
});
