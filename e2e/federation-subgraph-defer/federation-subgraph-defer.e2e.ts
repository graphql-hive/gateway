import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { meros } from 'meros/browser';
import { expect, it } from 'vitest';

/**
 * Dedicated e2e for `deferStream: { subgraph: true }`.
 *
 * Unlike gateway-owned `@defer` (omit deferred selections, refetch later),
 * subgraph forward keeps `@defer` on the upstream operation so a
 * defer-capable subgraph can stream patches. This is the path that needs
 * IncrementalReceiver + intact multipart AsyncIterables through batching.
 */
const { gateway, service } = createTenv(__dirname);

it('forwards @defer to a subgraph and flushes before the slow field', async () => {
  const catalog = await service('catalog');
  const { port } = await gateway({
    supergraph: {
      with: 'apollo',
      services: [catalog],
    },
  });

  const t0 = Date.now();
  const res = await fetch(`http://0.0.0.0:${port}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'multipart/mixed;deferSpec=20220824',
    },
    body: JSON.stringify({
      query: /* GraphQL */ `
        query CatalogProduct {
          product(id: "1") {
            id
            name
            ... @defer(label: "description") {
              description
            }
          }
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

  const payloads: Array<ExecutionResult & { hasNext?: boolean }> = [];
  let firstPartAt = 0;
  for await (const part of parts) {
    if (!part.json) continue;
    if (payloads.length === 0) {
      firstPartAt = Date.now() - t0;
    }
    payloads.push(part.body as ExecutionResult & { hasNext?: boolean });
  }

  // Incremental client response
  expect(payloads.length).toBeGreaterThan(1);
  expect(payloads[0]).toMatchObject({
    data: { product: { id: '1', name: 'Widget' } },
    hasNext: true,
  });
  expect(
    (payloads[0]?.data as { product?: { description?: string } })?.product
      ?.description,
  ).toBeUndefined();

  const merged = JSON.stringify(payloads);
  expect(merged).toContain('A carefully deferred product description');

  // Proof of forward (not gateway-owned omit): upstream saw @defer
  const recorded = await fetch(
    `http://0.0.0.0:${catalog.port}/_queries`,
  ).then((r) => r.json() as Promise<string[]>);
  expect(
    recorded.some((q) => q.includes('@defer')),
    `expected forwarded @defer in catalog queries, got:\n${recorded.join('\n---\n')}`,
  ).toBe(true);

  // description sleeps 150ms - first multipart part must beat that
  expect(firstPartAt).toBeLessThan(100);
});
