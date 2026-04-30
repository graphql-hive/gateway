import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };

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
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  TransportOptions: { input: any; output: any };
  join__FieldSet: { input: any; output: any };
  link__Import: { input: any; output: any };
};

export type Mutation = {
  __typename?: 'Mutation';
  addTodo: Todo;
};

export type MutationAddTodoArgs = {
  text: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  todo?: Maybe<Todo>;
  todos: Array<Todo>;
};

export type QueryTodoArgs = {
  id: Scalars['ID']['input'];
};

export type Subscription = {
  __typename?: 'Subscription';
  todoAdded: Todo;
};

export type Todo = {
  __typename?: 'Todo';
  id: Scalars['ID']['output'];
  text: Scalars['String']['output'];
};

export enum Join__Graph {
  Subgraph = 'SUBGRAPH',
}

export enum Link__Purpose {
  /** `EXECUTION` features provide metadata necessary for operation execution. */
  Execution = 'EXECUTION',
  /** `SECURITY` features provide metadata necessary to securely resolve fields. */
  Security = 'SECURITY',
}

export type TodosQueryVariables = Exact<{ [key: string]: never }>;

export type TodosQuery = { todos: Array<{ id: string; text: string }> };

export type AddTodoMutationVariables = Exact<{
  text: string;
}>;

export type AddTodoMutation = { addTodo: { id: string; text: string } };

export type TodoAddedSubscriptionVariables = Exact<{ [key: string]: never }>;

export type TodoAddedSubscription = { todoAdded: { id: string; text: string } };

export const TodosDocument = gql`
  query Todos {
    todos {
      id
      text
    }
  }
`;
export const AddTodoDocument = gql`
  mutation AddTodo($text: String!) {
    addTodo(text: $text) {
      id
      text
    }
  }
`;
export const TodoAddedDocument = gql`
  subscription TodoAdded {
    todoAdded {
      id
      text
    }
  }
`;
export type Requester<C = {}> = <R, V>(
  doc: DocumentNode,
  vars?: V,
  options?: C,
) => Promise<R> | AsyncIterable<R>;
export function getSdk<C>(requester: Requester<C>) {
  return {
    Todos(variables?: TodosQueryVariables, options?: C): Promise<TodosQuery> {
      return requester<TodosQuery, TodosQueryVariables>(
        TodosDocument,
        variables,
        options,
      ) as Promise<TodosQuery>;
    },
    AddTodo(
      variables: AddTodoMutationVariables,
      options?: C,
    ): Promise<AddTodoMutation> {
      return requester<AddTodoMutation, AddTodoMutationVariables>(
        AddTodoDocument,
        variables,
        options,
      ) as Promise<AddTodoMutation>;
    },
    TodoAdded(
      variables?: TodoAddedSubscriptionVariables,
      options?: C,
    ): AsyncIterable<TodoAddedSubscription> {
      return requester<TodoAddedSubscription, TodoAddedSubscriptionVariables>(
        TodoAddedDocument,
        variables,
        options,
      ) as AsyncIterable<TodoAddedSubscription>;
    },
  };
}
export type Sdk = ReturnType<typeof getSdk>;
