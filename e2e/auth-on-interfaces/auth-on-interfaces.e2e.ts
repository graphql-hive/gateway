import { createTenv } from '@internal/e2e';
import jwt from 'jsonwebtoken';
import { expect, it } from 'vitest';
import { JWT_SECRET } from './env';

const { gateway, service } = createTenv(__dirname);

type Scope = 'a' | 'b' | 'i';

it.each<{
  query: string;
  allow: Scope[];
}>([
  {
    query: '{ i { id } }',
    allow: ['i', 'a', 'b'],
  },
])('should allow $allow to query $query', async ({ query, allow }) => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('protected-req-on-int')],
    },
  });

  await expect(
    gw.execute({
      query,
      headers: {
        Authorization: `Bearer ${jwt.sign({ scope: allow }, JWT_SECRET)}`,
      },
    }),
  ).resolves.toEqual({
    data: expect.any(Object),
  });
});

it.each<{
  query: string;
  deny: Scope[];
}>([
  {
    query: '{ i { id } }',
    deny: ['i'],
  },
])('should deny $deny to query $query', async ({ query, deny }) => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('protected-req-on-int')],
    },
  });

  await expect(
    gw.execute({
      query,
      headers: {
        Authorization: `Bearer ${jwt.sign({ scope: deny }, JWT_SECRET)}`,
      },
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      errors: [
        expect.objectContaining({
          message: 'Unauthorized field or type',
        }),
      ],
    }),
  );
});
