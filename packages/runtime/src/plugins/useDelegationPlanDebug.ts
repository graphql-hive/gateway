import { Logger } from '@graphql-hive/logger';
import { pathToArray } from '@graphql-tools/utils';
import { print } from 'graphql';
import { FetchAPI } from 'graphql-yoga';
import type { GatewayContext, GatewayPlugin } from '../types';

/** Will add the plugin only if the log level is debug. */
export function useMaybeDelegationPlanDebug<
  TContext extends Record<string, any>,
>({ log: rootLog }: { log: Logger }): GatewayPlugin<TContext> {
  let activePlugin: GatewayPlugin<TContext> | undefined;
  return {
    onPluginInit({ plugins }) {
      let shouldLog = false;
      rootLog.debug(() => (shouldLog = true));
      if (shouldLog) {
        activePlugin = useDelegationPlanDebug();
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

function useDelegationPlanDebug<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  let fetchAPI: FetchAPI;
  const stageExecuteLogById = new WeakMap<GatewayContext, Set<string>>();
  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onDelegationPlan({
      typeName,
      variables,
      fragments,
      fieldNodes,
      context,
      info,
    }) {
      const planId = fetchAPI.crypto.randomUUID();
      const log = context.log.child(
        { planId, typeName },
        '[useDelegationPlanDebug] ',
      );

      const logObj: Record<string, any> = {};
      if (variables && Object.keys(variables).length) {
        logObj['variables'] = variables;
      }
      if (fragments && Object.keys(fragments).length) {
        logObj['fragments'] = Object.fromEntries(
          Object.entries(fragments).map(([name, fragment]) => [
            name,
            print(fragment),
          ]),
        );
      }
      if (fieldNodes && fieldNodes.length) {
        logObj['fieldNodes'] = fieldNodes.map((fieldNode) => print(fieldNode));
      }
      if (info?.path) {
        logObj['path'] = pathToArray(info.path).join(' | ');
      }
      log.debug(logObj, 'Start');
      return ({ delegationPlan }) => {
        log.debug(
          {
            delegationPlan: delegationPlan.map((plan) => {
              const planObj: Record<string, string> = {};
              for (const [subschema, selectionSet] of plan) {
                if (subschema.name) {
                  planObj[subschema.name] = print(selectionSet);
                }
              }
              return planObj;
            }),
          },
          'Done',
        );
      };
    },
    onDelegationStageExecute({
      object,
      info,
      context,
      subgraph,
      selectionSet,
      key,
      typeName,
    }) {
      let contextLog = stageExecuteLogById.get(context);
      if (!contextLog) {
        contextLog = new Set();
        stageExecuteLogById.set(context, contextLog);
      }
      const logAttr = {
        key: JSON.stringify(key),
        object: JSON.stringify(object),
        selectionSet: print(selectionSet),
      };
      const logStr = JSON.stringify(logAttr);
      if (contextLog.has(logStr)) {
        return;
      }
      contextLog.add(logStr);
      const logMeta: Record<string, string> = {
        stageId: fetchAPI.crypto.randomUUID(),
        subgraph,
        typeName,
      };
      const log = context.log.child(logMeta, '[useDelegationPlanDebug] ');
      log.debug(
        {
          ...logMeta,
          path: pathToArray(info.path).join(' | '),
        },
        'Stage start',
      );
      return ({ result }) => {
        log.debug(result, 'Stage done');
      };
    },
  };
}
