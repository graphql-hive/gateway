import {
  asArray,
  astFromArg,
  astFromValueUntyped,
  ExecutionRequest,
  getDefinedRootType,
} from '@graphql-tools/utils';
import {
  ArgumentNode,
  DefinitionNode,
  DocumentNode,
  FieldNode,
  GraphQLInputType,
  GraphQLObjectType,
  GraphQLSchema,
  isInputObjectType,
  isListType,
  isNonNullType,
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
  rootValue,
  targetOperationName,
  targetOperation,
  targetSchema,
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

  const newVariables = info?.variableValues ? { ...info.variableValues } : {};
  const variableDefinitions = [...(info?.operation.variableDefinitions || [])];
  const argNodes: ArgumentNode[] = [];

  if (args != null) {
    const rootType =
      targetSchema != null
        ? getDefinedRootType(targetSchema, targetOperation)
        : undefined;
    const rootField = rootType?.getFields()[rootFieldName];
    const rootFieldArgs = rootField?.args;
    for (const argName in args) {
      const argValue = args[argName];
      const argInstance = rootFieldArgs?.find((arg) => arg.name === argName);
      const existingArgNode = fieldNode?.arguments?.find(
        (argNode) => argNode.name.value === argName,
      );
      // Check if we can re-use the variable from the original request for this argument
      if (existingArgNode?.value.kind === Kind.VARIABLE) {
        const varName = existingArgNode.value.name.value;
        const varValue = newVariables[varName];
        // If the variable value is the same as the argument value,
        // we can re-use the variable and its definition
        if (varValue === argValue) {
          argNodes.push(existingArgNode);
          newVariables[varName] = varValue;
          continue;
        }
      }
      if (argInstance) {
        const argAst = astFromArg(argInstance, targetSchema);
        const varExists = (varName: string) =>
          variableDefinitions.some(
            (varDef) => varDef.variable.name.value === varName,
          ) ||
          // It should not conflict with the variable on the gateway request
          // Because the gateway request can have a variable that has nothing to do with
          // this argument
          info?.variableValues?.[varName] != null;
        let varName = argName;
        // Try `<argName>`, then `<rootFieldName>_<argName>`, then `_0_<rootFieldName>_<argName>`, etc.
        if (varExists(varName)) {
          varName = `_${rootFieldName}_${argName}`;
          let i = 0;
          while (varExists(varName)) {
            varName = `_${i++}_${rootFieldName}_${argName}`;
          }
        }
        variableDefinitions.push({
          kind: Kind.VARIABLE_DEFINITION,
          variable: {
            kind: Kind.VARIABLE,
            name: {
              kind: Kind.NAME,
              value: varName,
            },
          },
          type: argAst.type,
        });
        const varValue = projectArgumentValue(argValue, argInstance.type);
        if (varValue !== undefined) {
          newVariables[varName] = varValue;
        }
        argNodes.push({
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
        });
      } else {
        // For arguments that are not defined in the target schema, we inline them.
        const valueNode = astFromValueUntyped(argValue);
        if (valueNode != null) {
          argNodes.push({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: argName,
            },
            value: valueNode,
          });
        }
      }
    }
  }

  const rootfieldNode: FieldNode = {
    kind: Kind.FIELD,
    arguments: argNodes,
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
    variableDefinitions,
    selectionSet: {
      kind: Kind.SELECTION_SET,
      selections: [rootfieldNode],
    },
  };

  const definitions: Array<DefinitionNode> = [operationDefinition];

  if (fragments != null) {
    definitions.push(...fragments);
  }

  const document: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions,
  };

  return {
    subgraphName,
    document,
    variables: newVariables,
    rootValue,
    operationName: targetOperationName,
    context,
    info,
    operationType: targetOperation,
  };
}

function projectArgumentValue(argValue: any, argType: GraphQLInputType): any {
  if (argValue == null) {
    return argValue;
  }
  if (isNonNullType(argType)) {
    return projectArgumentValue(argValue, argType.ofType);
  }
  if (isListType(argType)) {
    return asArray(argValue).map((item: any) =>
      projectArgumentValue(item, argType.ofType),
    );
  }
  if (
    isInputObjectType(argType) &&
    typeof argValue === 'object' &&
    argValue !== null
  ) {
    const projectedValue: any = {};
    const fields = argType.getFields();
    for (const key in argValue) {
      const field = fields[key];
      if (field) {
        const varValue = projectArgumentValue(argValue[key], field.type);
        if (varValue !== undefined) {
          projectedValue[key] = varValue;
        }
      }
    }
    return projectedValue;
  }
  if (argValue != null) {
    if (argType.name === 'Boolean') {
      return Boolean(argValue);
    }
    if (argType.name === 'Int' || argType.name === 'Float') {
      return Number(argValue);
    }
    if (argType.name === 'String') {
      return String(argValue);
    }
  }
  return argValue;
}
