import {
  DelegationContext,
  isPrototypePollutingKey,
  Transform,
} from '@graphql-tools/delegate';
import { ExecutionRequest, ExecutionResult } from '@graphql-tools/utils';
import {
  FieldNode,
  Kind,
  SelectionNode,
  SelectionSetNode,
  visit,
} from 'graphql';

export type QueryWrapper = (
  subtree: SelectionSetNode,
) => SelectionNode | SelectionSetNode;

interface WrapQueryTransformationContext extends Record<string, any> {}

export default class WrapQuery<
  TContext = Record<string, any>,
> implements Transform<WrapQueryTransformationContext, TContext> {
  constructor(
    private readonly path: Array<string>,
    private readonly wrapper: QueryWrapper,
    private readonly extractor: (result: any) => any,
  ) {
    const pollutingKeys = this.path.filter(isPrototypePollutingKey);
    if (pollutingKeys.length > 0) {
      throw new TypeError(
        `Invalid path - cannot be a prototype polluting keys: ${pollutingKeys.join('.')}`,
      );
    }
  }

  public transformRequest(
    originalRequest: ExecutionRequest,
    _delegationContext: DelegationContext<TContext>,
    _transformationContext: WrapQueryTransformationContext,
  ): ExecutionRequest {
    const fieldPath: Array<string> = [];
    const ourPath = JSON.stringify(this.path);
    const document = visit(originalRequest.document, {
      [Kind.FIELD]: {
        enter: (node: FieldNode) => {
          fieldPath.push(node.name.value);
          if (
            node.selectionSet != null &&
            ourPath === JSON.stringify(fieldPath)
          ) {
            const wrapResult = this.wrapper(node.selectionSet);

            // Selection can be either a single selection or a selection set. If it's just one selection,
            // let's wrap it in a selection set. Otherwise, keep it as is.
            const selectionSet =
              wrapResult != null && wrapResult.kind === Kind.SELECTION_SET
                ? wrapResult
                : {
                    kind: Kind.SELECTION_SET,
                    selections: [wrapResult],
                  };

            return {
              ...node,
              selectionSet,
            };
          }
          return undefined;
        },
        leave: () => {
          fieldPath.pop();
        },
      },
    });
    return {
      ...originalRequest,
      document,
    };
  }

  public transformResult(
    originalResult: ExecutionResult,
    _delegationContext: DelegationContext<TContext>,
    _transformationContext: WrapQueryTransformationContext,
  ): ExecutionResult {
    const rootData = originalResult.data;
    if (rootData != null) {
      let data = rootData;
      const path = [...this.path];
      while (path.length > 1) {
        const next = path.shift()!;
        if (data[next]) {
          data = data[next];
        }
      }
      const lastKey = path[0]!;
      data[lastKey] = this.extractor(data[lastKey]);
    }

    return {
      data: rootData,
      errors: originalResult.errors,
    };
  }
}
