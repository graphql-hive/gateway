import {
  FieldNode,
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
  SelectionSetNode,
} from 'graphql';
import { MeshInContextSDK } from './incontext-sdk';

export type Maybe<T> = T | undefined;
export type InputMaybe<T> = T | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  ObjMap: { input: any; output: any };
  _DirectiveExtensions: { input: any; output: any };
  join__FieldSet: { input: any; output: any };
  link__Import: { input: any; output: any };
};

export enum HttpMethod {
  Connect = 'CONNECT',
  Delete = 'DELETE',
  Get = 'GET',
  Head = 'HEAD',
  Options = 'OPTIONS',
  Patch = 'PATCH',
  Post = 'POST',
  Put = 'PUT',
  Trace = 'TRACE',
}

export type Mutation = {
  __typename?: 'Mutation';
  usersByIds?: Maybe<UsersByIdResponse>;
};

export type MutationUsersByIdsArgs = {
  input?: InputMaybe<UsersByIdRequest_Input>;
};

export type Query = {
  __typename?: 'Query';
  dummy?: Maybe<Scalars['String']['output']>;
  user?: Maybe<User>;
};

export type QueryUserArgs = {
  id: Scalars['Float']['input'];
};

export type User = {
  __typename?: 'User';
  id: Scalars['Float']['output'];
  name: Scalars['String']['output'];
};

export type UsersByIdRequest_Input = {
  ids: Array<InputMaybe<Scalars['Float']['input']>>;
};

export type UsersByIdResponse = {
  __typename?: 'UsersByIdResponse';
  results: Array<Maybe<User>>;
};

export enum Join__Graph {
  Api = 'API',
}

export enum Link__Purpose {
  /** `EXECUTION` features provide metadata necessary for operation execution. */
  Execution = 'EXECUTION',
  /** `SECURITY` features provide metadata necessary to securely resolve fields. */
  Security = 'SECURITY',
}

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type LegacyStitchingResolver<TResult, TParent, TContext, TArgs> = {
  fragment: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type NewStitchingResolver<TResult, TParent, TContext, TArgs> = {
  selectionSet: string | ((fieldNode: FieldNode) => SelectionSetNode);
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type StitchingResolver<TResult, TParent, TContext, TArgs> =
  | LegacyStitchingResolver<TResult, TParent, TContext, TArgs>
  | NewStitchingResolver<TResult, TParent, TContext, TArgs>;
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>
  | StitchingResolver<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    { [key in TKey]: TResult },
    TParent,
    TContext,
    TArgs
  >;
  resolve?: SubscriptionResolveFn<
    TResult,
    { [key in TKey]: TResult },
    TContext,
    TArgs
  >;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  HTTPMethod: HttpMethod;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  ObjMap: ResolverTypeWrapper<Scalars['ObjMap']['output']>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  User: ResolverTypeWrapper<User>;
  UsersByIdRequest_Input: UsersByIdRequest_Input;
  UsersByIdResponse: ResolverTypeWrapper<UsersByIdResponse>;
  _DirectiveExtensions: ResolverTypeWrapper<
    Scalars['_DirectiveExtensions']['output']
  >;
  join__FieldSet: ResolverTypeWrapper<Scalars['join__FieldSet']['output']>;
  join__Graph: Join__Graph;
  link__Import: ResolverTypeWrapper<Scalars['link__Import']['output']>;
  link__Purpose: Link__Purpose;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  Float: Scalars['Float']['output'];
  Mutation: Record<PropertyKey, never>;
  ObjMap: Scalars['ObjMap']['output'];
  Query: Record<PropertyKey, never>;
  String: Scalars['String']['output'];
  User: User;
  UsersByIdRequest_Input: UsersByIdRequest_Input;
  UsersByIdResponse: UsersByIdResponse;
  _DirectiveExtensions: Scalars['_DirectiveExtensions']['output'];
  join__FieldSet: Scalars['join__FieldSet']['output'];
  link__Import: Scalars['link__Import']['output'];
};

export type AdditionalFieldDirectiveArgs = {};

export type AdditionalFieldDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = AdditionalFieldDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type ExtraSchemaDefinitionDirectiveDirectiveArgs = {
  directives?: Maybe<Scalars['_DirectiveExtensions']['input']>;
};

export type ExtraSchemaDefinitionDirectiveDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = ExtraSchemaDefinitionDirectiveDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type HttpOperationDirectiveArgs = {
  httpMethod?: Maybe<HttpMethod>;
  isBinary?: Maybe<Scalars['Boolean']['input']>;
  jsonApiFields?: Maybe<Scalars['Boolean']['input']>;
  operationSpecificHeaders?: Maybe<
    Array<Maybe<Array<Maybe<Scalars['String']['input']>>>>
  >;
  path?: Maybe<Scalars['String']['input']>;
  queryParamArgMap?: Maybe<Scalars['ObjMap']['input']>;
  queryStringOptions?: Maybe<Scalars['ObjMap']['input']>;
  queryStringOptionsByParam?: Maybe<Scalars['ObjMap']['input']>;
  requestBaseBody?: Maybe<Scalars['ObjMap']['input']>;
  subgraph?: Maybe<Scalars['String']['input']>;
};

export type HttpOperationDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = HttpOperationDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__EnumValueDirectiveArgs = {
  graph: Join__Graph;
};

export type Join__EnumValueDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__EnumValueDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__FieldDirectiveArgs = {
  external?: Maybe<Scalars['Boolean']['input']>;
  graph?: Maybe<Join__Graph>;
  override?: Maybe<Scalars['String']['input']>;
  provides?: Maybe<Scalars['join__FieldSet']['input']>;
  requires?: Maybe<Scalars['join__FieldSet']['input']>;
  type?: Maybe<Scalars['String']['input']>;
  usedOverridden?: Maybe<Scalars['Boolean']['input']>;
};

export type Join__FieldDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__FieldDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__GraphDirectiveArgs = {
  name: Scalars['String']['input'];
  url: Scalars['String']['input'];
};

export type Join__GraphDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__GraphDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__ImplementsDirectiveArgs = {
  graph: Join__Graph;
  interface: Scalars['String']['input'];
};

export type Join__ImplementsDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__ImplementsDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__TypeDirectiveArgs = {
  extension?: Scalars['Boolean']['input'];
  graph: Join__Graph;
  isInterfaceObject?: Scalars['Boolean']['input'];
  key?: Maybe<Scalars['join__FieldSet']['input']>;
  resolvable?: Scalars['Boolean']['input'];
};

export type Join__TypeDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__TypeDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__UnionMemberDirectiveArgs = {
  graph: Join__Graph;
  member: Scalars['String']['input'];
};

export type Join__UnionMemberDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__UnionMemberDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type LinkDirectiveArgs = {
  as?: Maybe<Scalars['String']['input']>;
  for?: Maybe<Link__Purpose>;
  import?: Maybe<Array<Maybe<Scalars['link__Import']['input']>>>;
  url?: Maybe<Scalars['String']['input']>;
};

export type LinkDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = LinkDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type TransportDirectiveArgs = {
  headers?: Maybe<Array<Maybe<Array<Maybe<Scalars['String']['input']>>>>>;
  kind?: Maybe<Scalars['String']['input']>;
  location?: Maybe<Scalars['String']['input']>;
  queryParams?: Maybe<Array<Maybe<Array<Maybe<Scalars['String']['input']>>>>>;
  queryStringOptions?: Maybe<Scalars['ObjMap']['input']>;
  subgraph?: Maybe<Scalars['String']['input']>;
};

export type TransportDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = TransportDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type MutationResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['Mutation'] =
    ResolversParentTypes['Mutation'],
> = {
  usersByIds?: Resolver<
    Maybe<ResolversTypes['UsersByIdResponse']>,
    ParentType,
    ContextType,
    Partial<MutationUsersByIdsArgs>
  >;
};

export interface ObjMapScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['ObjMap'],
  any
> {
  name: 'ObjMap';
}

export type QueryResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['Query'] =
    ResolversParentTypes['Query'],
> = {
  dummy?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  user?: Resolver<
    Maybe<ResolversTypes['User']>,
    ParentType,
    ContextType,
    RequireFields<QueryUserArgs, 'id'>
  >;
};

export type UserResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['User'] =
    ResolversParentTypes['User'],
> = {
  id?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type UsersByIdResponseResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['UsersByIdResponse'] =
    ResolversParentTypes['UsersByIdResponse'],
> = {
  results?: Resolver<
    Array<Maybe<ResolversTypes['User']>>,
    ParentType,
    ContextType
  >;
};

export interface _DirectiveExtensionsScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['_DirectiveExtensions'],
  any
> {
  name: '_DirectiveExtensions';
}

export interface Join__FieldSetScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['join__FieldSet'],
  any
> {
  name: 'join__FieldSet';
}

export interface Link__ImportScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['link__Import'],
  any
> {
  name: 'link__Import';
}

export type Resolvers<ContextType = MeshInContextSDK> = {
  Mutation?: MutationResolvers<ContextType>;
  ObjMap?: GraphQLScalarType;
  Query?: QueryResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UsersByIdResponse?: UsersByIdResponseResolvers<ContextType>;
  _DirectiveExtensions?: GraphQLScalarType;
  join__FieldSet?: GraphQLScalarType;
  link__Import?: GraphQLScalarType;
};

export type DirectiveResolvers<ContextType = MeshInContextSDK> = {
  additionalField?: AdditionalFieldDirectiveResolver<any, any, ContextType>;
  extraSchemaDefinitionDirective?: ExtraSchemaDefinitionDirectiveDirectiveResolver<
    any,
    any,
    ContextType
  >;
  httpOperation?: HttpOperationDirectiveResolver<any, any, ContextType>;
  join__enumValue?: Join__EnumValueDirectiveResolver<any, any, ContextType>;
  join__field?: Join__FieldDirectiveResolver<any, any, ContextType>;
  join__graph?: Join__GraphDirectiveResolver<any, any, ContextType>;
  join__implements?: Join__ImplementsDirectiveResolver<any, any, ContextType>;
  join__type?: Join__TypeDirectiveResolver<any, any, ContextType>;
  join__unionMember?: Join__UnionMemberDirectiveResolver<any, any, ContextType>;
  link?: LinkDirectiveResolver<any, any, ContextType>;
  transport?: TransportDirectiveResolver<any, any, ContextType>;
};
