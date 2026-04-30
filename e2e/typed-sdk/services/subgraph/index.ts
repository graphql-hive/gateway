import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Opts } from '@internal/testing';
import { createPubSub, createSchema, createYoga } from 'graphql-yoga';

const todos = [
  { id: '1', text: 'Learn GraphQL' },
  { id: '2', text: 'Build a GraphQL server' },
];

const pubsub = createPubSub();

const port = Opts(process.argv).getServicePort('subgraph');

createServer(
  createYoga({
    schema: createSchema({
      typeDefs: readFileSync(join(__dirname, 'schema.graphql'), 'utf-8'),
      resolvers: {
        Query: {
          todos: () => todos,
          todo: (_, { id }) => todos.find((todo) => todo.id === id),
        },
        Mutation: {
          addTodo: (_, { text }) => {
            const newTodo = { id: String(todos.length + 1), text };
            todos.push(newTodo);
            pubsub.publish('TODO_ADDED', { todoAdded: newTodo });
            return newTodo;
          },
        },
        Subscription: {
          todoAdded: {
            subscribe: () => pubsub.subscribe('TODO_ADDED'),
          },
        },
      },
    }),
  }),
).listen(port, () => {
  console.info(`Subgraph is running on http://localhost:${port}/graphql`);
});
