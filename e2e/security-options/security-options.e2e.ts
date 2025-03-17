import { createExampleSetup, createTenv, Gateway } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

function checkMaxTokens(
  gw: Gateway,
  // 1 alias contains ~3 tokens: the alias, ":" and the field
  aliases = 333,
) {
  const aLot = Array.from(
    {
      // we cut in half because
      length: aliases,
    },
    (_, i) => `n${i}: upc`,
  ).join(', ');
  return gw.execute({
    query: /* GraphQL */ `
      {
        topProducts {
          ${aLot}
        }
      }
    `,
  });
}

function checkMaxDepth(gw: Gateway, depth = 7) {
  let query = '{ topProducts { ';

  for (
    let i = 0;
    i < depth - 2; // substract 2 because we already are 2 levels deep
    i++
  ) {
    if (i % 2) {
      query += 'author { ';
    } else {
      query += 'reviews { ';
    }
  }
  query += 'id ';

  query += Array.from({ length: depth }, () => '}').join(' ');

  return gw.execute({ query });
}

function checkBlockSuggestions(gw: Gateway) {
  return gw.execute({
    query: /* GraphQL */ `
      {
        topProducts {
          upcie
        }
      }
    `,
  });
}

it('should enable all security features when setting true', async () => {
  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      SECURITY_OPT: 'true',
    },
  });

  // max tokens
  await expect(checkMaxTokens(gw)).resolves.toMatchInlineSnapshot(`
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
  await expect(checkMaxDepth(gw)).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "message": "Syntax Error: Query depth limit of 6 exceeded, found 7.",
        },
      ],
    }
  `);

  // block field suggestions
  await expect(checkBlockSuggestions(gw)).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "extensions": {
            "code": "GRAPHQL_VALIDATION_FAILED",
          },
          "locations": [
            {
              "column": 11,
              "line": 4,
            },
          ],
          "message": "Cannot query field "upcie" on type "Product". [Suggestion hidden]",
        },
      ],
    }
  `);
});
