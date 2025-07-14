// adapted from https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-source-graphql/src/batching/merge-queries.js

import { ExecutionResult, relocatedError } from '@graphql-tools/utils';
import { parseKey, parseKeyFromPath } from './prefix.js';

/**
 * Split and transform result of the query produced by the `merge` function
 */
export function splitResult(
  { data, errors }: ExecutionResult,
  numResults: number,
): Array<ExecutionResult> {
  const splitResults: ExecutionResult[] = Array.from(
    { length: numResults },
    () => ({ data: null }),
  );

  if (data) {
    for (const prefixedKey in data) {
      const { index, originalKey } = parseKey(prefixedKey);
      const result = splitResults[index];
      if (result == null) {
        splitResults[index] = {
          data: {
            [originalKey]: data[prefixedKey],
          },
        };
      } else if (result.data == null) {
        result.data = { [originalKey]: data[prefixedKey] };
      } else {
        result.data[originalKey] = data[prefixedKey];
      }
    }
  }

  if (errors) {
    for (const error of errors) {
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
