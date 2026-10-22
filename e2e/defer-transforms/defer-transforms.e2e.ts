import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { meros } from 'meros/browser';
import { expect, it } from 'vitest';

/**
 * E2E for `@defer` through mesh transforms (prefix + hoist + rename) with
 * `deferStream: { subgraph: true }`.
 *
 * Unit tests cover stitch-level transform/defer combinations; this locks the
 * real HTTP multipart path: compose → gateway → yoga subgraph → patches
 * reshaped back to gateway field names.
 */
const { gateway, service } = createTenv(__dirname);

async function startGateway() {
  const catalog = await service('catalog');
  const { port } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [catalog],
    },
  });
  return { port, catalog };
}

async function collectMultipart(port: number, query: string) {
  const t0 = Date.now();
  const res = await fetch(`http://0.0.0.0:${port}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'multipart/mixed;deferSpec=20220824',
    },
    body: JSON.stringify({ query }),
  });

  expect(res.ok, await res.clone().text()).toBe(true);
  expect(res.headers.get('content-type')).toContain('multipart/mixed');

  const parts = await meros<ExecutionResult>(res);
  if (!('next' in parts)) {
    throw new Error('Expected an async iterable of multipart parts');
  }

  const payloads: Array<ExecutionResult & { hasNext?: boolean }> = [];
  const timings: number[] = [];
  for await (const part of parts) {
    if (!part.json) continue;
    timings.push(Date.now() - t0);
    payloads.push(part.body as ExecutionResult & { hasNext?: boolean });
  }
  return { payloads, timings };
}

it('forwards @defer through hoist/rename transforms and flushes before the slow field', async () => {
  const { port, catalog } = await startGateway();

  // Warm the gateway → subgraph path so cold-start latency is not counted
  // against the incremental flush budget below.
  await fetch(`http://0.0.0.0:${port}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: /* GraphQL */ `
        {
          product(id: "1") {
            id
            title
          }
        }
      `,
    }),
  });

  const { payloads, timings } = await collectMultipart(
    port,
    /* GraphQL */ `
      query ShopProduct {
        product(id: "1") {
          id
          title
          details {
            summary
          }
          ... @defer(if: true, label: "blurb") {
            productBlurb
          }
        }
      }
    `,
  );

  expect(payloads.length).toBeGreaterThan(1);
  expect(payloads[0]).toMatchObject({
    data: {
      product: {
        id: '1',
        title: 'Widget',
        details: { summary: 'In stock' },
      },
    },
    hasNext: true,
  });
  expect(
    (payloads[0]?.data as { product?: { productBlurb?: string } })?.product
      ?.productBlurb,
  ).toBeUndefined();

  const recorded = await fetch(`http://0.0.0.0:${catalog.port}/_queries`).then(
    (r) =>
      r.json() as Promise<{ queries: string[]; blurbResolverCalls: number }>,
  );

  const blurbPatch = payloads
    .flatMap(
      (p) =>
        (
          p as ExecutionResult & {
            incremental?: Array<{
              path?: Array<string | number>;
              label?: string;
              data?: Record<string, unknown>;
            }>;
          }
        ).incremental ?? [],
    )
    .find(
      (inc) =>
        inc.label === 'blurb' ||
        (Array.isArray(inc.path) &&
          inc.path.join('.') === 'product' &&
          inc.data?.['productBlurb'] != null),
    );
  expect(blurbPatch).toBeDefined();
  expect(blurbPatch?.path).toEqual(['product']);
  expect(
    blurbPatch?.label === 'blurb' || blurbPatch?.data?.['productBlurb'] != null,
  ).toBe(true);

  const merged = JSON.stringify(payloads);
  expect(merged).toContain('A carefully deferred product blurb');
  // Gateway field name (hoisted), not the subgraph nested path
  expect(merged).toContain('productBlurb');

  expect(
    recorded.queries.some((q) => q.includes('@defer')),
    `expected forwarded @defer in catalog queries, got:\n${recorded.queries.join('\n---\n')}`,
  ).toBe(true);
  // Hoist unwraps the gateway field back to the nested subgraph selection
  expect(
    recorded.queries.some((q) => q.includes('blurb') || q.includes('details')),
  ).toBe(true);
  expect(recorded.blurbResolverCalls).toBeGreaterThan(0);

  // Initial payload flushed without the hoisted deferred field; the blurb
  // arrives in a later incremental part (timing is asserted in
  // federation-subgraph-defer - here we lock transform correctness).
  expect(timings.length).toBe(payloads.length);
  expect(payloads.some((p) => p.hasNext === false)).toBe(true);
});

it('surfaces deferred errors for transformed fields', async () => {
  const { port } = await startGateway();

  // Query the nested boom field without hoist so rename/prefix still apply
  // on the parent product type, while the deferred error comes from Details.
  const { payloads } = await collectMultipart(
    port,
    /* GraphQL */ `
      query ShopProductBoom {
        product(id: "1") {
          id
          title
          details {
            summary
            ... @defer(if: true, label: "boom") {
              boom
            }
          }
        }
      }
    `,
  );

  expect(payloads[0]).toMatchObject({
    data: {
      product: {
        id: '1',
        title: 'Widget',
        details: { summary: 'In stock' },
      },
    },
    hasNext: true,
  });

  const merged = JSON.stringify(payloads);
  expect(merged).toContain('deferred boom');
});
