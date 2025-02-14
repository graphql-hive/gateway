import { createExampleSetup, createTenv } from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { service } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);

it('executes the query', async () => {
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
  const received = await response.json();
  expect(received).toEqual(result);
});
