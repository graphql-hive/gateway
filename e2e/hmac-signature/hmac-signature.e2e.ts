import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);
describe('HMAC Signature', () => {
  it('works', async () => {
    const { execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('users')],
      },
    });
    const result = await execute({
      query: /* GraphQL */ `
        query {
          user(id: "1") {
            id
            name
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        user: {
          id: '1',
          name: 'Alice',
        },
      },
    });
  });
});
