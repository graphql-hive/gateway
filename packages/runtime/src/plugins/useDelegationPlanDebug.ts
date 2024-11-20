import type { Logger } from '@graphql-mesh/types';
import { pathToArray } from '@graphql-tools/utils';
import { print } from 'graphql';
import { FetchAPI } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useDelegationPlan<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  let fetchAPI: FetchAPI;
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
      logger = logger.child('delegation-plan');
      const planId = fetchAPI.crypto.randomUUID();
      logger.debug('start', () => {
        const logObj: Record<string, any> = {
          planId,
          subgraph,
          typeName,
        };
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
        return JSON.stringify(logObj);
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
      const stageId = fetchAPI.crypto.randomUUID();
      logger.debug('start', () =>
        JSON.stringify(
          {
            stageId,
            subgraph,
            typeName,
            key,
            object,
            path: pathToArray(info.path).join(' | '),
            selectionSet: print(selectionSet),
          },
          null,
          '  ',
        ),
      );
      return ({ result }) => {
        logger.debug('result', () =>
          JSON.stringify(
            {
              stageId,
              result,
            },
            null,
            '  ',
          ),
        );
      };
    },
  };
}
