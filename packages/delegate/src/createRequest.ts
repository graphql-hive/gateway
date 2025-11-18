import {
  astFromArg,
  astFromValueUntyped,
  ExecutionRequest,
  serializeInputValue,
} from '@graphql-tools/utils';
import {
  ArgumentNode,
  DefinitionNode,
  DocumentNode,
  FieldNode,
  GraphQLObjectType,
  GraphQLSchema,
  Kind,
  NameNode,
  OperationDefinitionNode,
  OperationTypeNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import { ICreateRequest } from './types.js';

export function getDelegatingOperation(
  parentType: GraphQLObjectType,
  schema: GraphQLSchema,
): OperationTypeNode {
  if (parentType === schema.getMutationType()) {
    return 'mutation' as OperationTypeNode;
  } else if (parentType === schema.getSubscriptionType()) {
    return 'subscription' as OperationTypeNode;
  }

  return 'query' as OperationTypeNode;
}

export function createRequest({
  subgraphName,
  fragments,
  targetRootValue,
  targetOperationName,
  targetOperation,
  transformedSchema,
  targetFieldName,
  selectionSet,
  fieldNodes,
  context,
  info,
  args,
}: ICreateRequest): ExecutionRequest {
  let newSelectionSet: SelectionSetNode | undefined;

  if (selectionSet != null) {
    newSelectionSet = selectionSet;
  } else {
    const selections: Array<SelectionNode> = [];
    for (const fieldNode of fieldNodes || []) {
      if (fieldNode.selectionSet) {
        for (const selection of fieldNode.selectionSet.selections) {
          selections.push(selection);
        }
      }
    }

    newSelectionSet = selections.length
      ? {
          kind: Kind.SELECTION_SET,
          selections,
        }
      : undefined;
  }

  const fieldNode = fieldNodes?.[0];
  const rootFieldName = targetFieldName ?? fieldNode?.name.value;

  if (rootFieldName === undefined) {
    throw new Error(
      `Either "targetFieldName" or a non empty "fieldNodes" array must be provided.`,
    );
  }

  const newVariables = Object.create(null);
  const variableDefinitionMap = Object.create(null);
  const argumentNodeMap: Record<string, ArgumentNode> = Object.create(null);

  if (args != null) {
    const rootType = (info?.schema || transformedSchema)?.getRootType(
      targetOperation,
    );
    const rootField = rootType?.getFields()[rootFieldName];
    const rootFieldArgs = rootField?.args;
    for (const argName in args) {
      const argValue = args[argName];
      const argInstance = rootFieldArgs?.find((arg) => arg.name === argName);
      if (argInstance) {
        const argAst = astFromArg(argInstance, transformedSchema);
        const varName = `${rootFieldName}_${argName}`;
        variableDefinitionMap[varName] = {
          kind: Kind.VARIABLE_DEFINITION,
          variable: {
            kind: Kind.VARIABLE,
            name: {
              kind: Kind.NAME,
              value: varName,
            },
          },
          type: argAst.type,
        };
        const serializedValue = serializeInputValue(argInstance.type, argValue);
        newVariables[varName] = serializedValue;
        argumentNodeMap[argName] = {
          kind: Kind.ARGUMENT,
          name: {
            kind: Kind.NAME,
            value: argName,
          },
          value: {
            kind: Kind.VARIABLE,
            name: {
              kind: Kind.NAME,
              value: varName,
            },
          },
        };
      } else {
        const argValueAst = astFromValueUntyped(argValue);
        if (argValueAst != null) {
          argumentNodeMap[argName] = {
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: argName,
            },
            value: argValueAst,
          };
        }
      }
    }
  }

  const rootfieldNode: FieldNode = {
    kind: Kind.FIELD,
    arguments: Object.values(argumentNodeMap),
    name: {
      kind: Kind.NAME,
      value: rootFieldName,
    },
    selectionSet: newSelectionSet,
    directives: fieldNode?.directives,
  };

  const operationName: NameNode | undefined = targetOperationName
    ? {
        kind: Kind.NAME,
        value: targetOperationName,
      }
    : undefined;

  const operationDefinition: OperationDefinitionNode = {
    kind: Kind.OPERATION_DEFINITION,
    name: operationName,
    operation: targetOperation,
    variableDefinitions: Object.values(variableDefinitionMap),
    selectionSet: {
      kind: Kind.SELECTION_SET,
      selections: [rootfieldNode],
    },
  };

  const definitions: Array<DefinitionNode> = [operationDefinition];

  if (fragments != null) {
    for (const fragmentName in fragments) {
      const fragment = fragments[fragmentName];
      if (fragment) {
        definitions.push(fragment);
      }
    }
  }

  const document: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions,
  };

  return {
    subgraphName,
    document,
    variables: newVariables,
    rootValue: targetRootValue,
    operationName: targetOperationName,
    context,
    info,
    operationType: targetOperation,
  };
}
