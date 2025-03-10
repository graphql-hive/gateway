import { createExampleSetup, createTenv } from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { service } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);

// TODO: run tests without needing to build the project
it.todo('executes the query', async () => {
  const supergraphPath = await supergraph();
  const { port } = await service('nestjs', {
    args: [`--supergraph=${supergraphPath}`],
  });
  const hostname = await getLocalhost(port);
  const response = await fetch(`${hostname}:${port}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}: ${await response.text()}`);
  }
  const received = await response.json();
  expect(received).toEqual(result);
});
