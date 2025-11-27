import {
  DelegationContext,
  getTypeInfo,
  Transform,
} from '@graphql-tools/delegate';
import {
  ExecutionRequest,
  ExecutionResult,
  getDefinedRootType,
  getRootTypeMap,
  MapperKind,
  mapSchema,
} from '@graphql-tools/utils';
import {
  GraphQLFieldConfigMap,
  GraphQLObjectType,
  GraphQLSchema,
  isObjectType,
  Kind,
  OperationTypeNode,
  visit,
  visitWithTypeInfo,
} from 'graphql';

const defaultRootTypeNames = {
  query: 'Query',
  mutation: 'Mutation',
  subscription: 'Subscription',
};

interface MoveRootFieldTransformationContext {
  newOperationType?: OperationTypeNode;
}

export class MoveRootField implements Transform<MoveRootFieldTransformationContext> {
  private to: Record<OperationTypeNode, Record<string, OperationTypeNode>> = {
    query: {},
    mutation: {},
    subscription: {},
  };

  private transformedSchema: GraphQLSchema | undefined;
  constructor(
    private from: Record<OperationTypeNode, Record<string, OperationTypeNode>>,
  ) {
    for (const operation in this.from) {
      const removedFields = this.from[operation as OperationTypeNode];
      for (const fieldName in removedFields) {
        const newOperation = removedFields[fieldName];
        this.to[newOperation as OperationTypeNode][fieldName] =
          operation as OperationTypeNode;
      }
    }
  }

  public transformSchema(
    schema: GraphQLSchema,
    _subschemaConfig: Record<string, any>,
  ): GraphQLSchema {
    const rootTypeMap = getRootTypeMap(schema);
    const newRootFieldsMap: Record<
      OperationTypeNode,
      GraphQLFieldConfigMap<any, any>
    > = {
      query:
        rootTypeMap.get('query' as OperationTypeNode)?.toConfig()?.fields || {},
      mutation:
        rootTypeMap.get('mutation' as OperationTypeNode)?.toConfig()?.fields ||
        {},
      subscription:
        rootTypeMap.get('subscription' as OperationTypeNode)?.toConfig()
          ?.fields || {},
    };
    for (const operation in this.from) {
      const removedFields = this.from[operation as OperationTypeNode];
      for (const fieldName in removedFields) {
        const fieldConfig =
          newRootFieldsMap[operation as OperationTypeNode][fieldName]!;
        delete newRootFieldsMap[operation as OperationTypeNode]?.[fieldName];
        const newOperation = removedFields[fieldName]!;
        newRootFieldsMap[newOperation][fieldName] = fieldConfig;
      }
    }
    const schemaConfig = schema.toConfig();
    for (const rootType in newRootFieldsMap) {
      const newRootFields = newRootFieldsMap[rootType as OperationTypeNode];
      if (
        !schemaConfig[rootType as OperationTypeNode] &&
        Object.keys(newRootFields).length > 0
      ) {
        schemaConfig[rootType as OperationTypeNode] = new GraphQLObjectType({
          name: defaultRootTypeNames[rootType as OperationTypeNode],
          fields: newRootFields,
        });
      }
    }
    this.transformedSchema = mapSchema(new GraphQLSchema(schemaConfig), {
      [MapperKind.QUERY]: (type) => {
        const queryConfig = type.toConfig();
        queryConfig.fields = newRootFieldsMap.query;
        return new GraphQLObjectType(queryConfig);
      },
      [MapperKind.MUTATION]: (type) => {
        const mutationConfig = type.toConfig();
        mutationConfig.fields = newRootFieldsMap.mutation;
        return new GraphQLObjectType(mutationConfig);
      },
      [MapperKind.SUBSCRIPTION]: (type) => {
        const subscriptionConfig = type.toConfig();
        subscriptionConfig.fields = newRootFieldsMap.subscription;
        return new GraphQLObjectType(subscriptionConfig);
      },
    });
    return this.transformedSchema;
  }

  public transformRequest(
    originalRequest: ExecutionRequest,
    _delegationContext: DelegationContext,
    transformationContext: MoveRootFieldTransformationContext,
  ): ExecutionRequest {
    const sourceOperationType =
      originalRequest.operationType || OperationTypeNode.QUERY;
    if (this.transformedSchema) {
      const typeInfo = getTypeInfo(this.transformedSchema);
      const rootTypes = getRootTypeMap(this.transformedSchema);
      const reversedRootTypeMap = new Map<
        GraphQLObjectType,
        OperationTypeNode
      >();
      for (const [opType, type] of rootTypes.entries()) {
        reversedRootTypeMap.set(type, opType);
      }
      return {
        ...originalRequest,
        document: visit(
          originalRequest.document,
          visitWithTypeInfo(typeInfo, {
            [Kind.FIELD]: {
              enter: (node) => {
                const parentType = typeInfo.getParentType();
                if (isObjectType(parentType)) {
                  const parentOperation = reversedRootTypeMap.get(parentType);
                  if (
                    parentOperation != null &&
                    this.to[parentOperation][node.name.value] != null
                  ) {
                    transformationContext.newOperationType =
                      this.to[parentOperation][node.name.value];
                  }
                }
              },
            },
            [Kind.OPERATION_DEFINITION]: {
              leave: (node) => {
                if (
                  transformationContext.newOperationType &&
                  transformationContext.newOperationType !== sourceOperationType
                ) {
                  return {
                    ...node,
                    operation: transformationContext.newOperationType,
                  };
                }
                return node;
              },
            },
          }),
        ),
      };
    }
    return originalRequest;
  }

  public transformResult(
    result: ExecutionResult,
    _delegationContext: DelegationContext,
    transformationContext: MoveRootFieldTransformationContext,
  ) {
    if (
      this.transformedSchema &&
      result.data?.__typename &&
      transformationContext.newOperationType
    ) {
      const rootType = getDefinedRootType(
        this.transformedSchema,
        transformationContext.newOperationType,
      );
      if (rootType) {
        result.data.__typename = rootType.name;
      }
    }
    return result;
  }
}
