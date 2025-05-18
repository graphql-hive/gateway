// adapted from https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-source-graphql/src/batching/merge-queries.js

import { ExecutionResult, relocatedError } from '@graphql-tools/utils';
import { parseKey, parseKeyFromPath } from './prefix.js';

/**
 * Split and transform result of the query produced by the `merge` function
 */
export function splitResult(
  mergedResult: ExecutionResult,
  numResults: number,
): Array<ExecutionResult> {
  const splitResults = new Array<ExecutionResult>(numResults);

  if (mergedResult.data) {
    for (const prefixedKey in mergedResult.data) {
      const { index, originalKey } = parseKey(prefixedKey);
      const result = splitResults[index];
      if (result == null) {
        splitResults[index] = {
          data: {
            [originalKey]: mergedResult.data[prefixedKey],
          },
        };
      } else if (result.data == null) {
        result.data = { [originalKey]: mergedResult.data[prefixedKey] };
      } else {
        result.data[originalKey] = mergedResult.data[prefixedKey];
      }
    }
  }

  if (mergedResult.errors) {
    for (const error of mergedResult.errors) {
      if (error.path) {
        const { index, originalKey, keyOffset } = parseKeyFromPath(error.path);
        const newError = relocatedError(error, [
          originalKey,
          ...error.path.slice(keyOffset),
        ]);
        const splittedResult = splitResults[index];
        if (splittedResult == null) {
          splitResults[index] = { errors: [newError] };
          continue;
        } else if (splittedResult.errors == null) {
          splittedResult.errors = [newError];
          continue;
        } else {
          // @ts-expect-error - We know it is not readonly
          splittedResult.errors.push(newError);
        }
      } else {
        for (let i = 0; i < numResults; i++) {
          const splittedResult = splitResults[i];
          if (splittedResult == null) {
            splitResults[i] = { errors: [error] };
            continue;
          } else if (splittedResult.errors == null) {
            splittedResult.errors = [error];
            continue;
          } else {
            // @ts-expect-error - We know it is not readonly
            splittedResult.errors.push(error);
          }
        }
      }
    }
  }

  return splitResults;
}
