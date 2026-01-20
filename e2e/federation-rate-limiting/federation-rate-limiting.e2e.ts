import { setTimeout } from 'timers/promises';
import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

it('should rate limit with calmdown', async () => {
  const rateLimitTtl = 1_000;
  const { execute } = await gateway({
    supergraph: await supergraph(),
    env: {
      RATE_LIMIT_TTL: rateLimitTtl,
    },
  });

  const query = /* GraphQL */ `
    {
      users {
        id
      }
    }
  `;

  for (let i = 0; i < 5; i++) {
    // first 5 requests should not be rate limited
    for (let j = 0; j < 5; j++) {
      await expect(execute({ query })).resolves.toEqual({
        data: {
          users: expect.any(Array),
        },
      });
    }

    // then 6th request should be rate limited
    await expect(execute({ query })).resolves.toEqual({
      errors: expect.arrayContaining([
        expect.objectContaining({
          message: 'Rate limit of "Query.users" exceeded for "anonymous"',
        }),
      ]),
    });

    // wait until ttl passes
    const ttl = AbortSignal.timeout(rateLimitTtl);
    await new Promise<void>((resolve) => (ttl.onabort = () => resolve()));
  }
});

it('should rate limit under pressure', async () => {
  const rateLimitTtl = 1_000;
  const { execute } = await gateway({
    supergraph: await supergraph(),
    env: {
      RATE_LIMIT_TTL: rateLimitTtl,
    },
  });

  const query = /* GraphQL */ `
    {
      users {
        id
      }
    }
  `;

  for (let i = 0; i < 5; i++) {
    if (i > 0) {
      // then 1st request should still be rate limited because we were spamming
      await expect(execute({ query })).resolves.toEqual({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: 'Rate limit of "Query.users" exceeded for "anonymous"',
          }),
        ]),
      });

      await setTimeout(rateLimitTtl);
    }

    // (then) first 5 requests should not be rate limited
    for (let j = 0; j < 5; j++) {
      await expect(execute({ query })).resolves.toEqual({
        data: {
          users: expect.any(Array),
        },
      });
    }

    // then 6th request should be rate limited
    await expect(execute({ query })).resolves.toEqual({
      errors: expect.arrayContaining([
        expect.objectContaining({
          message: 'Rate limit of "Query.users" exceeded for "anonymous"',
        }),
      ]),
    });

    // keep spamming until ttl passes
    const ttl = AbortSignal.timeout(rateLimitTtl);
    while (!ttl.aborted) {
      await execute({ query });
    }
  }
});
