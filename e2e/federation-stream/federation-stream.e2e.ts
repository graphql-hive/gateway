import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { meros } from 'meros/browser';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('streams a [String!]! scalar list via @stream over a federated subgraph', async () => {
  const alphabetSvc = await service('alphabet');
  const { port } = await gateway({
    supergraph: {
      with: 'apollo',
      services: [alphabetSvc],
    },
  });

  const res = await fetch(`http://0.0.0.0:${port}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'multipart/mixed',
    },
    body: JSON.stringify({
      query: /* GraphQL */ `
        query {
          alphabet @stream(initialCount: 1)
        }
      `,
    }),
  });

  expect(res.ok).toBe(true);
  expect(res.headers.get('content-type')).toContain('multipart/mixed');

  const parts = await meros<ExecutionResult>(res);
  if (!('next' in parts)) {
    throw new Error('Expected an async iterable of multipart parts');
  }

  const executionResult: ExecutionResult<{ alphabet: string[] }> = {
    data: { alphabet: [] },
  };

  for await (const part of parts) {
    if (!part.json) continue;
    const payload = part.body as ExecutionResult & {
      incremental?: { items?: string[]; path?: (string | number)[] }[];
      hasNext?: boolean;
    };

    if (payload.data != null) {
      Object.assign(executionResult, payload);
    }
    if (payload.incremental) {
      for (const chunk of payload.incremental) {
        if (chunk.items) {
          executionResult.data!.alphabet.push(...chunk.items);
        }
      }
    }
    if (payload.errors) {
      executionResult.errors = payload.errors;
    }
  }

  expect(executionResult.errors).toBeUndefined();
  expect(executionResult.data).toEqual({
    alphabet: ['a', 'b', 'c', 'd', 'e'],
  });
});
