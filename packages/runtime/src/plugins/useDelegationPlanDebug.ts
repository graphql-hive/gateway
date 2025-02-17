import type { Logger } from '@graphql-mesh/types';
import { pathToArray } from '@graphql-tools/utils';
import { print } from 'graphql';
import { FetchAPI } from 'graphql-yoga';
import type { GatewayContext, GatewayPlugin } from '../types';

export function useDelegationPlanDebug<
  TContext extends Record<string, any>,
>(opts: { logger: Logger }): GatewayPlugin<TContext> {
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
      info,
      logger = opts.logger,
    }) {
      const planId = fetchAPI.crypto.randomUUID();
      const planLogger = logger.child({ planId, typeName });
      const delegationPlanStartLogger = planLogger.child(
        'delegation-plan-start',
      );
      delegationPlanStartLogger.debug(() => {
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
      });
      return ({ delegationPlan }) => {
        const delegationPlanDoneLogger = logger.child('delegation-plan-done');
        delegationPlanDoneLogger.debug(() =>
          delegationPlan.map((plan) => {
            const planObj: Record<string, string> = {};
            for (const [subschema, selectionSet] of plan) {
              if (subschema.name) {
                planObj[subschema.name] = print(selectionSet);
              }
            }
            return planObj;
          }),
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
      logger = opts.logger,
    }) {
      let contextLog = stageExecuteLogById.get(context);
      if (!contextLog) {
        contextLog = new Set();
        stageExecuteLogById.set(context, contextLog);
      }
      const log = {
        key: JSON.stringify(key),
        object: JSON.stringify(object),
        selectionSet: print(selectionSet),
      };
      const logStr = JSON.stringify(log);
      if (contextLog.has(logStr)) {
        return;
      }
      contextLog.add(logStr);
      const logMeta: Record<string, string> = {
        stageId: fetchAPI.crypto.randomUUID(),
        subgraph,
        typeName,
      };
      const delegationStageLogger = logger.child(logMeta);
      delegationStageLogger.debug('delegation-plan-start', () => {
        return {
          ...log,
          path: pathToArray(info.path).join(' | '),
        };
      });
      return ({ result }) => {
        const delegationStageExecuteDoneLogger = logger.child(
          'delegation-stage-execute-done',
        );
        delegationStageExecuteDoneLogger.debug(() => result);
      };
    },
  };
}
