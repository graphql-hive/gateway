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
      skipTypeMerging = true,
    ) {
      return batchDelegateToSchema({
        schema: subschema,
        // Preserve mutation for type merges that only exist under Mutation
        // (graphql-tools#4549). Subscriptions must still merge via query —
        // you cannot re-subscribe for entity fields.
        operation: (info.operation.operation === 'mutation'
          ? 'mutation'
          : 'query') as OperationTypeNode,
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
        operation: (info.operation.operation === 'mutation'
          ? 'mutation'
          : 'query') as OperationTypeNode,
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
