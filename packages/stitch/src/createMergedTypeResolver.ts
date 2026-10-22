import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import {
  delegateToSchema,
  MergedTypeResolver,
  MergedTypeResolverOptions,
  Subschema,
} from '@graphql-tools/delegate';
import {
  getNamedType,
  GraphQLList,
  GraphQLOutputType,
  OperationTypeNode,
} from 'graphql';
import { GraphQLResolveInfo } from 'graphql/type';

function getMergeOperation(
  info: GraphQLResolveInfo,
  subschema: Subschema<any, any, any, any>,
  fieldName: string | undefined,
): OperationTypeNode {
  // Preserve mutation only when the merge entry point lives on Mutation
  // (graphql-tools#4549). Federation `_entities` and other Query-only merge
  // fields must stay on query even when the gateway operation is a mutation.
  // Subscriptions always merge via query - you cannot re-subscribe for entity fields.
  if (info.operation.operation !== 'mutation' || fieldName == null) {
    return 'query' as OperationTypeNode;
  }
  const schema = subschema.transformedSchema;
  if (schema.getMutationType()?.getFields()[fieldName] != null) {
    return 'mutation' as OperationTypeNode;
  }
  return 'query' as OperationTypeNode;
}

export function createMergedTypeResolver<
  TContext extends Record<string, any> = any,
>(
  mergedTypeResolverOptions: MergedTypeResolverOptions,
  mergedType?: GraphQLOutputType | string,
): MergedTypeResolver<TContext> | undefined {
  const { fieldName, argsFromKeys, valuesFromResults, args } =
    mergedTypeResolverOptions;

  function getType(info: GraphQLResolveInfo): GraphQLOutputType {
    if (!mergedType) {
      return getNamedType(info.returnType);
    }
    if (typeof mergedType === 'string') {
      return info.schema.getType(mergedType) as GraphQLOutputType;
    }
    return mergedType;
  }

  if (argsFromKeys != null) {
    return function mergedBatchedTypeResolver(
      _originalResult,
      context,
      info,
      subschema,
      selectionSet,
      key,
      type = getType(info),
      skipTypeMerging = true,
    ) {
      return batchDelegateToSchema({
        schema: subschema,
        operation: getMergeOperation(info, subschema, fieldName),
        fieldName,
        returnType: new GraphQLList(type),
        key,
        argsFromKeys,
        valuesFromResults,
        selectionSet,
        context,
        info,
        skipTypeMerging,
        dataLoaderOptions: mergedTypeResolverOptions.dataLoaderOptions,
      });
    };
  }

  if (args != null) {
    return function mergedTypeResolver(
      originalResult,
      context,
      info,
      subschema,
      selectionSet,
      _key,
      type = getType(info),
      skipTypeMerging = true,
    ) {
      return delegateToSchema({
        schema: subschema,
        operation: getMergeOperation(info, subschema, fieldName),
        fieldName,
        returnType: type,
        args: args(originalResult),
        selectionSet,
        context,
        info,
        skipTypeMerging,
      });
    };
  }

  return undefined;
}
