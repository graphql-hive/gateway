import { DelegationContext, Transform } from '@graphql-tools/delegate';
import { ExecutionRequest } from '@graphql-tools/utils';
import { BREAK, FieldNode, Kind, SelectionSetNode, visit } from 'graphql';

interface ExtractFieldTransformationContext extends Record<string, any> {}

export default class ExtractField<TContext = Record<string, any>>
  implements Transform<ExtractFieldTransformationContext, TContext>
{
  private readonly from: Array<string>;
  private readonly to: Array<string>;

  constructor({ from, to }: { from: Array<string>; to: Array<string> }) {
    this.from = from;
    this.to = to;
  }

  public transformRequest(
    originalRequest: ExecutionRequest,
    _delegationContext: DelegationContext<TContext>,
    _transformationContext: ExtractFieldTransformationContext,
  ): ExecutionRequest {
    let fromSelection: SelectionSetNode | undefined;
    const ourPathFrom = JSON.stringify(this.from);
    const ourPathTo = JSON.stringify(this.to);
    let fieldPath: Array<string> = [];
    visit(originalRequest.document, {
      [Kind.FIELD]: {
        enter: (node: FieldNode) => {
          fieldPath.push(node.name.value);
          if (ourPathFrom === JSON.stringify(fieldPath)) {
            fromSelection = node.selectionSet;
            return BREAK;
          }
          return undefined;
        },
        leave: () => {
          fieldPath.pop();
        },
      },
    });

    fieldPath = [];
    const document = visit(originalRequest.document, {
      [Kind.FIELD]: {
        enter: (node: FieldNode) => {
          fieldPath.push(node.name.value);
          if (
            ourPathTo === JSON.stringify(fieldPath) &&
            fromSelection != null
          ) {
            return {
              ...node,
              selectionSet: fromSelection,
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
}
