import { Maybe, memoize1, memoize2 } from '@graphql-tools/utils';
import { GraphQLSchema, GraphQLType, TypeInfo } from 'graphql';

export const getTypeInfo = memoize1(function getTypeInfo(
  schema: GraphQLSchema,
) {
  return new TypeInfo(schema);
});

export const getTypeInfoWithType = memoize2(function getTypeInfoWithType(
  schema: GraphQLSchema,
  type: Maybe<GraphQLType>,
) {
  return new TypeInfo(schema, type);
});
