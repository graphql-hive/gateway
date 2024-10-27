import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it('should execute', async () => {
  const { execute } = await gateway({ supergraph: { with: 'mesh' } });
  await expect(
    execute({
      query: /* GraphQL */ `
        query Metrics {
          metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end(
            access: all_access
            agent: user
            start: "20200101"
            end: "20200226"
            project: "en.wikipedia.org"
            granularity: daily
          ) {
            ... on pageview_project {
              items {
                views
              }
            }
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end": {
          "items": [
            {
              "views": 251269426,
            },
            {
              "views": 268920258,
            },
            {
              "views": 264139157,
            },
            {
              "views": 263223806,
            },
            {
              "views": 281644795,
            },
            {
              "views": 288258779,
            },
            {
              "views": 274868425,
            },
            {
              "views": 265674834,
            },
            {
              "views": 262894974,
            },
            {
              "views": 257460877,
            },
            {
              "views": 260429193,
            },
            {
              "views": 278575834,
            },
            {
              "views": 277540873,
            },
            {
              "views": 271661525,
            },
            {
              "views": 261316738,
            },
            {
              "views": 262574894,
            },
            {
              "views": 253126793,
            },
            {
              "views": 255096104,
            },
            {
              "views": 277613184,
            },
            {
              "views": 281145569,
            },
            {
              "views": 268440458,
            },
            {
              "views": 263249933,
            },
            {
              "views": 262433466,
            },
            {
              "views": 257384061,
            },
            {
              "views": 255541977,
            },
            {
              "views": 278443117,
            },
            {
              "views": 292464883,
            },
            {
              "views": 270772229,
            },
            {
              "views": 260524308,
            },
            {
              "views": 257732732,
            },
            {
              "views": 248206663,
            },
            {
              "views": 244934940,
            },
            {
              "views": 265318374,
            },
            {
              "views": 276224331,
            },
            {
              "views": 261069365,
            },
            {
              "views": 262715392,
            },
            {
              "views": 259931201,
            },
            {
              "views": 247873441,
            },
            {
              "views": 263134092,
            },
            {
              "views": 278995396,
            },
            {
              "views": 293768484,
            },
            {
              "views": 267073808,
            },
            {
              "views": 260339950,
            },
            {
              "views": 258557598,
            },
            {
              "views": 245577997,
            },
            {
              "views": 256179598,
            },
            {
              "views": 276950447,
            },
            {
              "views": 274320398,
            },
            {
              "views": 270860495,
            },
            {
              "views": 265142387,
            },
            {
              "views": 260041466,
            },
            {
              "views": 247876009,
            },
            {
              "views": 247227677,
            },
            {
              "views": 267332134,
            },
            {
              "views": 269889291,
            },
            {
              "views": 261068472,
            },
            {
              "views": 258661981,
            },
          ],
        },
      },
    }
  `);
});
