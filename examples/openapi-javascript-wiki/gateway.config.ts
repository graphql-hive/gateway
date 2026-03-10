import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  transportEntries: {
    '*.rest': {
      headers: [['user-agent', 'hive-gateway/e2e']],
    },
  },
  additionalResolvers: {
    Query: {
      async viewsInPastMonth(
        root: any,
        { project }: any, // args
        context: any,
        info: any,
      ) {
        const result =
          await context.Wiki.Query.metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end(
            {
              root,
              args: {
                access: 'all_access',
                agent: 'user',
                start: '20200101',
                end: '20200226',
                project,
                granularity: 'daily',
              },
              context,
              info,
              selectionSet: /* GraphQL */ `
                {
                  ... on pageview_project {
                    items {
                      views
                    }
                  }
                }
              `,
            },
          );

        let total = BigInt(0);
        for (const item of result?.items || []) {
          total += BigInt(item.views);
        }
        return total.toString();
      },
    },
  },
});
