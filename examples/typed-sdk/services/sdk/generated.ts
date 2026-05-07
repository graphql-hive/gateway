/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
export type TodosQueryVariables = Exact<{ [key: string]: never; }>;


export type TodosQuery = { todos: Array<{ id: string, text: string }> };

export type AddTodoMutationVariables = Exact<{
  text: string;
}>;


export type AddTodoMutation = { addTodo: { id: string, text: string } };

export type TodoAddedSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type TodoAddedSubscription = { todoAdded: { id: string, text: string } };


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
export type Requester<C = {}> = <R, V>(doc: DocumentNode, vars?: V, options?: C) => Promise<R> | AsyncIterable<R>
export function getSdk<C>(requester: Requester<C>) {
  return {
    Todos(variables?: TodosQueryVariables, options?: C): Promise<TodosQuery> {
      return requester<TodosQuery, TodosQueryVariables>(TodosDocument, variables, options) as Promise<TodosQuery>;
    },
    AddTodo(variables: AddTodoMutationVariables, options?: C): Promise<AddTodoMutation> {
      return requester<AddTodoMutation, AddTodoMutationVariables>(AddTodoDocument, variables, options) as Promise<AddTodoMutation>;
    },
    TodoAdded(variables?: TodoAddedSubscriptionVariables, options?: C): AsyncIterable<TodoAddedSubscription> {
      return requester<TodoAddedSubscription, TodoAddedSubscriptionVariables>(TodoAddedDocument, variables, options) as AsyncIterable<TodoAddedSubscription>;
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;