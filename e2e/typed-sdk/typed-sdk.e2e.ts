import { join } from 'path';
import {
  createGatewayRuntime,
  GatewayRuntime,
} from '@graphql-hive/gateway-runtime';
import { createTenv, Service } from '@internal/e2e';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSdk } from './sdk/generated';

describe('Typed SDK', () => {
  const { service, composeWithMesh } = createTenv(__dirname);
  let subgraph: Service;
  let sdk: ReturnType<typeof getSdk>;
  let gw: GatewayRuntime;
  beforeAll(async () => {
    // Run compose and get the path of supergraph
    subgraph = await service('subgraph', { port: 4001 });
    await composeWithMesh({
      services: [subgraph],
      args: ['-o', 'supergraph.graphql'],
    });
    gw = createGatewayRuntime({
      supergraph: join(__dirname, './supergraph.graphql'),
    });
    sdk = getSdk(gw.sdkRequester);
  });
  afterAll(async () => {
    await gw.dispose();
  });
  it('works with a simple query', async () => {
    const result = await sdk.Todos();
    expect(result).toEqual({
      todos: [
        { id: '1', text: 'Learn GraphQL' },
        { id: '2', text: 'Build a GraphQL server' },
      ],
    });
  });
  it('works with a mutation', async () => {
    const result = await sdk.AddTodo({ text: 'Write tests' });
    expect(result).toEqual({
      addTodo: { id: '3', text: 'Write tests' },
    });
  });
  it('works with a subscription', async () => {
    const iterable = sdk.TodoAdded();
    const iterator = iterable[Symbol.asyncIterator]();
    // Trigger the subscription by adding a new todo
    await sdk.AddTodo({
      text: 'Trigger subscription',
    });
    const subscriptionResult = await iterator.next();
    expect(subscriptionResult).toEqual({
      value: { todoAdded: { id: '4', text: 'Trigger subscription' } },
      done: false,
    });
    await iterator.return?.();
  });
});
