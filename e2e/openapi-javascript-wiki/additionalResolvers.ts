import type { Resolvers } from './types/resolvers';

export const additionalResolvers: Resolvers = {
  Query: {
    async viewsInPastMonth(root, { start, end, project }, context, info) {
      const result =
        await context.Wiki.Query.metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end(
          {
            root,
            args: {
              access: 'all_access',
              agent: 'user',
              start,
              end,
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
        if (item?.views) {
          total += BigInt(item.views);
        }
      }
      return total.toString();
    },
  },
};
