import type { Logger } from '@graphql-mesh/types';
import { pathToArray } from '@graphql-tools/utils';
import { print } from 'graphql';
import type { GatewayPlugin } from '../types';
import { generateUUID } from '../utils';

export function useDelegationPlan<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  return {
    onDelegationPlan({
      subgraph,
      typeName,
      variables,
      fragments,
      fieldNodes,
      info,
      logger = opts.logger,
    }) {
      logger = logger.child('delegation-plan');
      const planId = generateUUID();
      logger.debug('start', () => {
        const logObj: Record<string, any> = {
          planId,
          subgraph,
          typeName,
        };
        if (variables && Object.keys(variables).length) {
          logObj['variables'] = JSON.stringify(variables, null, '  ');
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
        }));
      };
    },
    onDelegationStageExecute({
      object,
      info,
      subgraph,
      selectionSet,
      key,
      typeName,
      logger = opts.logger,
    }) {
      logger = logger.child('delegation-stage-execute');
      const stageId = generateUUID();
      logger.debug('start', () => ({
        stageId,
        subgraph,
        typeName,
        key: JSON.stringify(key),
        object: JSON.stringify(object),
        path: pathToArray(info.path).join(' | '),
        selectionSet: print(selectionSet),
      }));
      return ({ result }) => {
        logger.debug('result', () => ({
          stageId,
          result: JSON.stringify(result, null, '  '),
        }));
      };
    },
  };
}
