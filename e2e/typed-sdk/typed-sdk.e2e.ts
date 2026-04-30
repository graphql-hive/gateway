import { runCli } from '@graphql-codegen/cli';
import { createTenv, Service } from '@internal/e2e';
import { createDeferredPromise, getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { EventSource } from 'eventsource';
import { beforeAll, describe, expect, it } from 'vitest';

describe('Typed SDK', () => {
  const { service, composeWithMesh } = createTenv(__dirname);
  let sdkService: Service;
  let subgraph: Service;
  let sdkUrl: string;
  beforeAll(async () => {
    // Run compose and get the path of supergraph
    subgraph = await service('subgraph');
    const { output } = await composeWithMesh({
      services: [subgraph],
      output: 'graphql',
    });
    // Run codegen to generate the SDK using the workspace-installed CLI
    const oldVal = process.env['SUPERGRAPH_PATH'];
    process.env['SUPERGRAPH_PATH'] = output;
    // Mock process.cwd to make sure it uses the correct config file
    const originalCwd = process.cwd;
    process.cwd = () => __dirname;
    await runCli('');
    process.env['SUPERGRAPH_PATH'] = oldVal;
    process.cwd = originalCwd;
    sdkService = await service('sdk', {
      env: { ...process.env, SUPERGRAPH_PATH: output },
    });
    sdkUrl =
      (await getLocalhost(sdkService.port, sdkService.protocol)) +
      `:${sdkService.port}`;
  });
  it('works with a simple query', async () => {
    const response = await fetch(`${sdkUrl}/query`);
    const result = await response.json();
    expect(result).toEqual({
      todos: [
        { id: '1', text: 'Learn GraphQL' },
        { id: '2', text: 'Build a GraphQL server' },
      ],
    });
  });
  it('works with a mutation', async () => {
    const response = await fetch(`${sdkUrl}/mutation`);
    const result = await response.json();
    expect(result).toEqual({
      addTodo: { id: '3', text: 'Write tests' },
    });
  });
  it('works with a subscription', async () => {
    // Listen the subscriptions in the background
    // Stop and return the first result that comes in
    const listenDeferred = createDeferredPromise();
    const eventSource = new EventSource(`${sdkUrl}/subscription`);
    eventSource.onopen = async () => {
      // Trigger the subscription by adding a new todo
      await fetch(`${sdkUrl}/mutation`);
    };
    eventSource.onerror = (error) => {
      listenDeferred.reject(error);
      eventSource.close();
    };
    eventSource.onmessage = (event) => {
      const parsedData = JSON.parse(event.data);
      listenDeferred.resolve(parsedData);
      eventSource.close();
    };
    const subscriptionResult = await listenDeferred.promise;
    expect(subscriptionResult).toEqual({
      todoAdded: { id: '4', text: 'Write tests' },
    });
  });
});
