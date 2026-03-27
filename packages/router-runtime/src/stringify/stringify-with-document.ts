import { ExecutionResult } from '@graphql-tools/utils';
import { DocumentNode, GraphQLSchema } from 'graphql';
import { QueryPlanExecutionContext } from '../executor.js';
import { CLOSE_BRACE, CLOSE_BRACKET, COMMA, OPEN_BRACE } from './consts.js';
import {
  ObjectStringifyOptions,
  projectWithPlan,
  stringifyWithoutSelectionSet,
} from './data.js';
import { stringifyError } from './error.js';
import { getOrCompileProjectionPlan } from './projection-plan.js';

// Re-exported for any downstream consumers that imported this type directly.
export interface StringifyContext {
  schema: GraphQLSchema;
  document: DocumentNode;
  operationName?: string;
  variables?: Record<string, unknown>;
}

// Pre-computed JSON key fragments for the top-level response object.
// Avoids repeated string concatenation on every serialized response.
const DATA_KEY = '"data":';
const ERRORS_KEY_OPEN = '"errors":[';
const COMMA_ERRORS_KEY_OPEN = ',"errors":[';
const EXTENSIONS_KEY = '"extensions":';
const COMMA_EXTENSIONS_KEY = ',"extensions":';

// Strip the internal `http` extension from the top-level result extensions before
// serializing – mirrors the stripping done by omitInternalsFromResultErrors in the
// non-plan-based code path.
const RESULT_EXTENSIONS_OPTIONS: ObjectStringifyOptions = {
  ignoredFields: new Set(['http']),
};

export function stringifyExecutionResult(
  result: ExecutionResult,
  executionContext: QueryPlanExecutionContext,
): string {
  // Retrieve (or build and cache) the pre-compiled projection plan.
  const plan = getOrCompileProjectionPlan(executionContext);
  if (!plan) {
    // Could not find the operation in the document – fall back to regular stringify
    return stringifyWithoutSelectionSet(result);
  }

  let buf = OPEN_BRACE;
  let first = true;

  if (result.data !== undefined) {
    first = false;
    buf +=
      DATA_KEY +
      projectWithPlan(
        result.data,
        plan.fields,
        executionContext.variableValues,
      );
  }

  if (result.errors?.length) {
    buf += first ? ERRORS_KEY_OPEN : COMMA_ERRORS_KEY_OPEN;
    first = false;
    for (let i = 0; i < result.errors.length; i++) {
      if (i > 0) buf += COMMA;
      buf += stringifyError(result.errors[i]!);
    }
    buf += CLOSE_BRACKET;
  }

  if (result.extensions != null) {
    // Check whether there are any public (non-internal) extensions to emit.
    // Reuse the same set from RESULT_EXTENSIONS_OPTIONS to avoid duplicating the list.
    const ignoredFields = RESULT_EXTENSIONS_OPTIONS.ignoredFields!;
    let hasPublicExtensions = false;
    for (const key in result.extensions) {
      if (!ignoredFields.has(key)) {
        hasPublicExtensions = true;
        break;
      }
    }
    if (hasPublicExtensions) {
      buf += first ? EXTENSIONS_KEY : COMMA_EXTENSIONS_KEY;
      // first = false; (unused after this point)
      buf += stringifyWithoutSelectionSet(
        result.extensions,
        RESULT_EXTENSIONS_OPTIONS,
      );
    }
  }

  buf += CLOSE_BRACE;
  return buf;
}
