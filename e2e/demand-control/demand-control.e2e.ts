import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Demand Control', async () => {
  const { service, gateway } = createTenv(__dirname);
  const books = await service('books');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [books],
    },
  });
  it('returns the metadata', async () => {
    const result = await gw.execute({
      query: /* GraphQL */ `
        query BookQuery {
          book(id: 1) {
            title
            author {
              name
            }
            publisher {
              name
              address {
                zipCode
              }
            }
          }
        }
      `,
    });
    expect(result).toMatchObject({
      extensions: {
        cost: {
          estimated: 8,
        },
      },
    });
  });
  it('throws if exceeds max cost', async () => {
    const result = await gw.execute({
      query: /* GraphQL */ `
        query BestsellersQuery {
          bestsellers {
            title
            author {
              name
            }
            publisher {
              name
              address {
                zipCode
              }
            }
          }
        }
      `,
    });
    expect(result).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'COST_ESTIMATED_TOO_EXPENSIVE',
            cost: {
              estimated: 40,
              max: 35,
            },
          },
        },
      ],
    });
  });
});
