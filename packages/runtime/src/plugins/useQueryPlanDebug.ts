import { Logger } from '@graphql-hive/logger';
import type { GatewayPlugin } from '../types';

export function useMaybeQueryPlanDebug<TContext extends Record<string, any>>({
  log,
}: {
  log: Logger;
}): GatewayPlugin<TContext> {
  let activePlugin: GatewayPlugin<TContext> | undefined;
  return {
    onPluginInit({ plugins }) {
      let shouldLog = false;
      log.debug(() => (shouldLog = true));
      if (shouldLog) {
        activePlugin = useQueryPlanDebug();
        // plugins.push will run the plugin last, but addPlugin will run it after this plugin. we dont care?
        plugins.push(
          // @ts-expect-error TODO: fix types
          activePlugin,
        );
      } else if (activePlugin) {
        const index = plugins.indexOf(
          // @ts-expect-error TODO: fix types
          activePlugin,
        );
        if (
          // must be
          index > -1
        ) {
          plugins.splice(index, 1);
        }
        activePlugin = undefined;
      }
    },
  };
}

function useQueryPlanDebug<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  return {
    onQueryPlan({ executionRequest }) {
      return ({ queryPlan }) => {
        executionRequest.context?.log.debug(
          {
            queryPlan,
            operationName: executionRequest.operationName || 'Anonymous',
          },
          `[useQueryPlanDebug] `,
        );
      };
    },
  };
}
