import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGatewayRuntime } from '@graphql-hive/gateway';
import { getSdk } from './sdk/generated';

async function main() {
  const supergraphPath = join(__dirname, './supergraph.graphql');

  await using runtime = createGatewayRuntime({
    supergraph: readFileSync(supergraphPath, 'utf-8'),
  });

  const sdk = getSdk(runtime.sdkRequester);

  console.log('Testing Todos query');
  const todosResult = await sdk.Todos();
  console.log('Todos query result:', todosResult);

  console.log('Testing AddTodo mutation');
  const addTodoResult = await sdk.AddTodo({
    text: 'Write tests',
  });
  console.log('AddTodo mutation result:', addTodoResult);

  console.log('Testing TodoAdded subscription');
  const iterable = sdk.TodoAdded();
  const iterator = iterable[Symbol.asyncIterator]();
  // Trigger the subscription by adding a new todo
  await sdk.AddTodo({
    text: 'Trigger subscription',
  });
  const subscriptionResult = await iterator.next();
  console.log('TodoAdded subscription result:', subscriptionResult);

  await iterator.return?.();
}

main().catch((error) => {
  console.error('Error in main:', error);
  process.exit(1);
});
