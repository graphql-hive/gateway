import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import {
  delegateToSchema,
  MergedTypeResolver,
  MergedTypeResolverOptions,
} from '@graphql-tools/delegate';
import {
  getNamedType,
  GraphQLList,
  GraphQLOutputType,
  OperationTypeNode,
} from 'graphql';
import { GraphQLResolveInfo } from 'graphql/type';

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
    ) {
      return batchDelegateToSchema({
        schema: subschema,
        operation: 'query' as OperationTypeNode,
        fieldName,
        returnType: new GraphQLList(type),
        key,
        argsFromKeys,
        valuesFromResults,
        selectionSet,
        context,
        info,
        skipTypeMerging: true,
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
    ) {
      return delegateToSchema({
        schema: subschema,
        operation: 'query' as OperationTypeNode,
        fieldName,
        returnType: type,
        args: args(originalResult),
        selectionSet,
        context,
        info,
        skipTypeMerging: true,
      });
    };
  }

  return undefined;
}
