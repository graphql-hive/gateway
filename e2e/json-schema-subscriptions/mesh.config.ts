import { defineConfig } from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadJSONSchemaSubgraph } from '@omnigraph/json-schema';
import { OperationTypeNode } from 'graphql';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadJSONSchemaSubgraph('API', {
        endpoint: `http://localhost:${opts.getServicePort('api')}`,
        operationHeaders: {
          'Content-Type': 'application/json',
        },
        operations: [
          {
            type: OperationTypeNode.QUERY,
            field: 'todos',
            path: '/todos',
            method: 'GET',
            responseSample: './todos.json',
          },
          {
            type: OperationTypeNode.MUTATION,
            field: 'addTodo',
            path: '/todo',
            method: 'POST',
            requestSample: './addTodo.json',
            responseSample: './todo.json',
          },
          {
            type: OperationTypeNode.SUBSCRIPTION,
            field: 'todoAdded',
            pubsubTopic: 'webhook:post:/webhooks/todo_added',
            responseSample: './todo.json',
          },
        ],
      }),
    },
  ],
  additionalTypeDefs: /* GraphQL */ `
    directive @live on QUERY
  `,
});
