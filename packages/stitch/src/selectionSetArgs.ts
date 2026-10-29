import { parseSelectionSet } from '@graphql-tools/utils';
import {
  ArgumentNode,
  FieldNode,
  Kind,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';

/**
 * Per-field argument forwarding map for {@link forwardArgsToSelectionSet}.
 *
 * - `string[]`: forward gateway args with the same names (filter).
 * - `Record<string, string>`: forward gateway arg names to different selection
 *   field arg names (e.g. `{ country: 'countryCode' }`).
 */
export type ForwardArgsMapping = Record<
  string,
  string[] | Record<string, string>
>;

const renameArgument = (
  argument: ArgumentNode,
  name: string,
): ArgumentNode => ({
  ...argument,
  name: {
    ...argument.name,
    value: name,
  },
});

export const forwardArgsToSelectionSet: (
  selectionSet: string,
  mapping?: ForwardArgsMapping,
) => (field: FieldNode) => SelectionSetNode = (
  selectionSet: string,
  mapping?: ForwardArgsMapping,
) => {
  const selectionSetDef = parseSelectionSet(selectionSet, { noLocation: true });
  return (field: FieldNode): SelectionSetNode => {
    const selections = selectionSetDef.selections.map(
      (selectionNode): SelectionNode => {
        if (selectionNode.kind === Kind.FIELD) {
          if (!mapping) {
            return { ...selectionNode, arguments: field.arguments?.slice() };
          }

          const selectionArgs = mapping[selectionNode.name.value];
          if (Array.isArray(selectionArgs)) {
            return {
              ...selectionNode,
              arguments: field.arguments?.filter(
                (arg): boolean => !!selectionArgs.includes(arg.name.value),
              ),
            };
          }

          if (selectionArgs) {
            return {
              ...selectionNode,
              arguments: field.arguments?.flatMap((arg) => {
                const mappedName = selectionArgs[arg.name.value];
                return mappedName ? [renameArgument(arg, mappedName)] : [];
              }),
            };
          }
        }
        return selectionNode;
      },
    );

    return { ...selectionSetDef, selections };
  };
};
