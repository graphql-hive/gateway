import type { InContextSdkMethod } from '@graphql-mesh/types';

export namespace ApiTypes {
  export type Maybe<T> = T | undefined;
  export type InputMaybe<T> = T | undefined;
  /** All built-in and custom scalars, mapped to their actual values */
  export type Scalars = {
    ID: { input: string; output: string };
    String: { input: string; output: string };
    Boolean: { input: boolean; output: boolean };
    Int: { input: number; output: number };
    Float: { input: number; output: number };
    ObjMap: { input: unknown; output: unknown };
    _DirectiveExtensions: { input: unknown; output: unknown };
    link__Import: { input: unknown; output: unknown };
    _Any: { input: unknown; output: unknown };
  };

  export type HTTPMethod =
    | 'CONNECT'
    | 'DELETE'
    | 'GET'
    | 'HEAD'
    | 'OPTIONS'
    | 'PATCH'
    | 'POST'
    | 'PUT'
    | 'TRACE';

  export type link__Purpose =
    /** `EXECUTION` features provide metadata necessary for operation execution. */
    | 'EXECUTION'
    /** `SECURITY` features provide metadata necessary to securely resolve fields. */
    | 'SECURITY';

  export type Mutation = {
    __typename: 'Mutation';
    usersByIds?: Maybe<UsersByIdResponse>;
  };

  export type MutationusersByIdsArgs = {
    input?: InputMaybe<UsersByIdRequest_Input>;
  };

  export type Query = {
    __typename: 'Query';
    dummy?: Maybe<Scalars['String']['output']>;
  };

  export type User = {
    __typename: 'User';
    id: Scalars['Float']['output'];
    name: Scalars['String']['output'];
  };

  export type UsersByIdRequest_Input = {
    ids: Array<InputMaybe<Scalars['Float']['input']>>;
  };

  export type UsersByIdResponse = {
    __typename: 'UsersByIdResponse';
    results: Array<Maybe<User>>;
  };

  export type _Entity = {};

  export type QuerySdk = {
    dummy: InContextSdkMethod<Query['dummy'], {}, {}>;
  };

  export type MutationSdk = {
    usersByIds: InContextSdkMethod<
      Mutation['usersByIds'],
      MutationusersByIdsArgs,
      {}
    >;
  };

  export type SubscriptionSdk = {};

  export type Context = {
    ['API']: {
      Query: QuerySdk;
      Mutation: MutationSdk;
      Subscription: SubscriptionSdk;
    };
  };
}
