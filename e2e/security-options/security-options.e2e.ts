import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

it('should enable all security features when setting true', async () => {
  const { execute } = await gateway({
    supergraph: await supergraph(),
    env: {
      SECURITY_OPT: 'true',
    },
  });

  // max tokens
  const veryLongAlias = Array.from({ length: 500 }, (_, i) => `n${i}`);
  await expect(
    execute({
      query: /* GraphQL */ `
        {
          topProducts {
            ${veryLongAlias}_1: upc
            ${veryLongAlias}_2: name
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "extensions": {
            "code": "GRAPHQL_PARSE_FAILED",
          },
          "message": "Syntax Error: Token limit of 1000 exceeded.",
        },
      ],
    }
  `);

  // max depth
  await expect(
    execute({
      query: /* GraphQL */ `
        {
          # 1
          topProducts {
            # 2
            reviews {
              # 3
              author {
                # 4
                reviews {
                  # 5
                  author {
                    # 6
                    reviews {
                      # 7
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "message": "Syntax Error: Query depth limit of 6 exceeded, found 7.",
        },
      ],
    }
  `);

  // block field suggestions
  await expect(
    execute({
      query: /* GraphQL */ `
        {
          topProducts {
            upcie
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "extensions": {
            "code": "GRAPHQL_VALIDATION_FAILED",
          },
          "locations": [
            {
              "column": 13,
              "line": 4,
            },
          ],
          "message": "Cannot query field "upcie" on type "Product". [Suggestion hidden]",
        },
      ],
    }
  `);
});
