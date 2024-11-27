import type { Logger } from '@graphql-mesh/types';
import { pathToArray } from '@graphql-tools/utils';
import { print } from 'graphql';
import { FetchAPI } from 'graphql-yoga';
import type { GatewayContext, GatewayPlugin } from '../types';

export function useDelegationPlan<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  let fetchAPI: FetchAPI;
  const stageExecuteLogById = new WeakMap<GatewayContext, Set<string>>();
  let isDebug: boolean | undefined;
  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onDelegationPlan({
      subgraph,
      typeName,
      variables,
      fragments,
      fieldNodes,
      info,
      logger = opts.logger,
    }) {
      if (isDebug == null || isDebug) {
        logger = logger.child('delegation-plan');
        const planId = fetchAPI.crypto.randomUUID();
        logger.debug('start', () => {
          isDebug = true;
          const logObj: Record<string, any> = {
            planId,
            subgraph,
            typeName,
          };
          if (variables && Object.keys(variables).length) {
            logObj['variables'] = JSON.stringify(variables);
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
        if (isDebug) {
          const start = performance.now();
          return ({ delegationPlan }) => {
            logger.debug('done', () => ({
              planId,
              plan: delegationPlan.map((plan) => {
                const planObj: Record<string, string> = {};
                for (const [subschema, selectionSet] of plan) {
                  if (subschema.name) {
                    planObj[subschema.name] = print(selectionSet);
                  }
                }
                return planObj;
              }),
              duration: performance.now() - start,
            }));
          };
        }
      }
      return undefined;
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
      if (isDebug == null || isDebug) {
        logger = logger.child('delegation-stage-execute');
        let stageId: string;
        let contextLog = stageExecuteLogById.get(context);
        if (!contextLog) {
          contextLog = new Set();
          stageExecuteLogById.set(context, contextLog);
        }
        const log = {
          subgraph,
          typeName,
          key: JSON.stringify(key),
          object: JSON.stringify(object),
          selectionSet: print(selectionSet),
        };
        const logStr = JSON.stringify(log);
        if (contextLog.has(logStr)) {
          return;
        }
        contextLog.add(logStr);
        stageId = fetchAPI.crypto.randomUUID();
        logger.debug('start', () => {
          isDebug = true;
          return {
            stageId,
            ...log,
            path: pathToArray(info.path).join(' | '),
          };
        });
        if (isDebug == null) {
          isDebug = false;
        }
        if (isDebug) {
          const start = performance.now();
          return ({ result }) => {
            logger.debug('result', () => ({
              stageId,
              result: JSON.stringify(result, null),
              duration: performance.now() - start,
            }));
          };
        }
      }
      return undefined;
    },
  };
}
