import type { InContextSdkMethod } from '@graphql-mesh/types';

export namespace ApiTypes {
  export type Maybe<T> = T | null;
  export type InputMaybe<T> = Maybe<T>;
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
        [P in keyof T]?: P extends ' $fragmentName' | '__typename'
          ? T[P]
          : never;
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
    _Any: { input: any; output: any };
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

  export type Mutation = {
    usersByIds?: Maybe<UsersByIdResponse>;
  };

  export type MutationusersByIdsArgs = {
    input?: InputMaybe<UsersByIdRequest_Input>;
  };

  export type Query = {
    dummy?: Maybe<Scalars['String']['output']>;
  };

  export type User = {
    id: Scalars['Float']['output'];
    name: Scalars['String']['output'];
  };

  export type UsersByIdRequest_Input = {
    ids: Array<InputMaybe<Scalars['Float']['input']>>;
  };

  export type UsersByIdResponse = {
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
