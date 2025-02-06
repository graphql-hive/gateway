import { createGraphQLError, memoize1 } from '@graphql-tools/utils';
import { OperationDefinitionNode } from 'graphql';

export const getOperationsAndFragments = memoize1(
  function getOperationAndFragments(document) {
    const operations: Record<string, any> = Object.create(null);
    const fragments: Record<string, any> = Object.create(null);
    let singleOperation: OperationDefinitionNode | undefined;
    let operationCnt: number = 0;
    for (const definition of document.definitions) {
      if (definition.kind === 'OperationDefinition') {
        if (definition.name) {
          operations[definition.name.value] = definition;
        }
        singleOperation = definition;
        operationCnt++;
      } else if (definition.kind === 'FragmentDefinition') {
        fragments[definition.name.value] = definition;
      }
    }
    if (!singleOperation) {
      throw createGraphQLError('Must provide an operation.');
    }
    return { operations, fragments, singleOperation, operationCnt };
  },
);
