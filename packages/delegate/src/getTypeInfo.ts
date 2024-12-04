import { Maybe, memoize1, memoize2 } from '@graphql-tools/utils';
import { GraphQLSchema, GraphQLType, TypeInfo, versionInfo } from 'graphql';

export const getTypeInfo = memoize1(function getTypeInfo(
  schema: GraphQLSchema,
) {
  return new TypeInfo(schema);
});

export const getTypeInfoWithType = memoize2(function getTypeInfoWithType(
  schema: GraphQLSchema,
  type: Maybe<GraphQLType>,
) {
  return versionInfo.major < 16
    ? new TypeInfo(schema, undefined, type as any)
    : new TypeInfo(schema, type as any);
});
