import { BigIntResolver } from 'graphql-scalars';
import type { Resolvers } from './types/resolvers';

export const additionalResolvers: Resolvers = {
  BigInt: BigIntResolver,
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

      return (result?.items || []).reduce(
        (sum, item) => sum + (item?.views ? BigInt(item.views) : 0n),
        0n,
      );
    },
  },
};
