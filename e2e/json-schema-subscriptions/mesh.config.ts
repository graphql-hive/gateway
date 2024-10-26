import { defineConfig as defineComposeConfig } from '@graphql-mesh/compose-cli';
import useMeshLiveQuery from '@graphql-mesh/plugin-live-query';
import { defineConfig as defineGatewayConfig } from '@graphql-mesh/serve-cli';
import { Opts } from '@internal/testing';
import { loadJSONSchemaSubgraph } from '@omnigraph/json-schema';
import { OperationTypeNode } from 'graphql';

const opts = Opts(process.argv);

export const composeConfig = defineComposeConfig({
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

export const gatewayConfig = defineGatewayConfig({
  webhooks: true,
  plugins: (ctx) => [
    useMeshLiveQuery({
      ...ctx,
      invalidations: [
        {
          field: 'Mutation.addTodo',
          invalidate: ['Query.todos'],
        },
      ],
    }),
  ],
});
