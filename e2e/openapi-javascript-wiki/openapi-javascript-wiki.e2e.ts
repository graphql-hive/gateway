import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it.concurrent.each([
  {
    name: 'Metrics',
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
  },
])('should execute $name', async ({ query }) => {
  const { execute } = await gateway({ supergraph: { with: 'mesh' } });
  await expect(execute({ query })).resolves.toMatchSnapshot();
});
