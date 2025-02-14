import {
  createExampleSetup,
  createTenv,
  getAvailablePort,
} from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { spawn } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);

it('executes the query', async () => {
  const SUPERGRAPH = await supergraph();
  const PORT = await getAvailablePort();
  const [nest, waitForExit] = await spawn('yarn nest', {
    args: ['start'],
    env: {
      SUPERGRAPH,
      PORT,
    },
  });
  const hostname = await getLocalhost(PORT);
  const response = await fetch(`${hostname}:${PORT}/graphql`, {
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
