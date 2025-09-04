import { createExampleSetup, createTenv, Gateway } from '@internal/e2e';
import { it } from 'vitest';

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

function checkMaxDepth(gw: Gateway, depth = 8) {
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

it.concurrent('should have default armor features', async ({ expect }) => {
  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      ARMOR_OPT: 'default',
    },
  });

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

  await expect(checkMaxDepth(gw)).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "message": "Syntax Error: Query depth limit of 7 exceeded, found 8.",
        },
      ],
    }
  `);
});

it.concurrent('should enable all armor features', async ({ expect }) => {
  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      ARMOR_OPT: 'true',
    },
  });

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

  await expect(checkMaxDepth(gw)).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "message": "Syntax Error: Query depth limit of 7 exceeded, found 8.",
        },
      ],
    }
  `);

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

it.concurrent('should disable all armor features', async ({ expect }) => {
  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      ARMOR_OPT: 'false',
    },
  });

  // too much for inline snapshot
  await expect(checkMaxTokens(gw)).resolves.toMatchSnapshot();

  // too much for inline snapshot
  await expect(checkMaxDepth(gw)).resolves.toMatchSnapshot();

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
          "message": "Cannot query field "upcie" on type "Product". Did you mean "upc" or "price"?",
        },
      ],
    }
  `);
});

it.concurrent(
  'should disable each armor feature when setting them to false',
  async ({ expect }) => {
    const gw = await gateway({
      supergraph: await supergraph(),
      env: {
        ARMOR_OPT: 'each-false',
      },
    });

    // too much for inline snapshot
    await expect(checkMaxTokens(gw)).resolves.toMatchSnapshot();

    // too much for inline snapshot
    await expect(checkMaxDepth(gw)).resolves.toMatchSnapshot();

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
          "message": "Cannot query field "upcie" on type "Product". Did you mean "upc" or "price"?",
        },
      ],
    }
  `);
  },
);

it.concurrent(
  'should enable only max tokens but disable others',
  async ({ expect }) => {
    const gw = await gateway({
      supergraph: await supergraph(),
      env: {
        ARMOR_OPT: 'only-max-tokens',
      },
    });

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

    // too much for inline snapshot
    await expect(checkMaxDepth(gw)).resolves.toMatchSnapshot();

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
          "message": "Cannot query field "upcie" on type "Product". Did you mean "upc" or "price"?",
        },
      ],
    }
  `);
  },
);

it.concurrent('should have configurable max tokens', async ({ expect }) => {
  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      ARMOR_OPT: 'max-tokens-10',
    },
  });

  await expect(checkMaxTokens(gw, 5)).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "extensions": {
            "code": "GRAPHQL_PARSE_FAILED",
          },
          "message": "Syntax Error: Token limit of 10 exceeded.",
        },
      ],
    }
  `);
});

it.concurrent(
  'should enable only max depth but disable others',
  async ({ expect }) => {
    const gw = await gateway({
      supergraph: await supergraph(),
      env: {
        ARMOR_OPT: 'only-max-depth',
      },
    });

    // too much for inline snapshot
    await expect(checkMaxTokens(gw)).resolves.toMatchSnapshot();

    await expect(checkMaxDepth(gw)).resolves.toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "message": "Syntax Error: Query depth limit of 7 exceeded, found 8.",
          },
        ],
      }
    `);

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
          "message": "Cannot query field "upcie" on type "Product". Did you mean "upc" or "price"?",
        },
      ],
    }
  `);
  },
);

it.concurrent('should have configurable max depth', async ({ expect }) => {
  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      ARMOR_OPT: 'max-depth-4',
    },
  });

  // too much for inline snapshot
  await expect(checkMaxTokens(gw)).resolves.toMatchSnapshot();

  await expect(checkMaxDepth(gw, 5)).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "message": "Syntax Error: Query depth limit of 4 exceeded, found 5.",
        },
      ],
    }
  `);

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
          "message": "Cannot query field "upcie" on type "Product". Did you mean "upc" or "price"?",
        },
      ],
    }
  `);
});

it.concurrent(
  'should enable only block field suggestions but disable others',
  async ({ expect }) => {
    const gw = await gateway({
      supergraph: await supergraph(),
      env: {
        ARMOR_OPT: 'only-block-field-suggestions',
      },
    });

    // too much for inline snapshot
    await expect(checkMaxTokens(gw)).resolves.toMatchSnapshot();

    // too much for inline snapshot
    await expect(checkMaxDepth(gw)).resolves.toMatchSnapshot();

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
  },
);
