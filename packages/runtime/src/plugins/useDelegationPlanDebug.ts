import { pathToArray } from '@graphql-tools/utils';
import { print } from 'graphql';
import { FetchAPI } from 'graphql-yoga';
import type { GatewayContext, GatewayPlugin } from '../types';

export function useDelegationPlanDebug<
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
      log.debug(() => {
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
          logObj['fieldNodes'] = fieldNodes.map((fieldNode) =>
            print(fieldNode),
          );
        }
        if (info?.path) {
          logObj['path'] = pathToArray(info.path).join(' | ');
        }
        return logObj;
      }, 'Start');
      return ({ delegationPlan }) => {
        log.debug(
          () => ({
            delegationPlan: delegationPlan.map((plan) => {
              const planObj: Record<string, string> = {};
              for (const [subschema, selectionSet] of plan) {
                if (subschema.name) {
                  planObj[subschema.name] = print(selectionSet);
                }
              }
              return planObj;
            }),
          }),
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
        () => ({
          ...log,
          path: pathToArray(info.path).join(' | '),
        }),
        'Stage start',
      );
      return ({ result }) => {
        log.debug(() => result, 'Stage done');
      };
    },
  };
}
