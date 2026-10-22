import { assertAsyncIterable } from '@internal/testing';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

function multipartResponse(parts: object[]) {
  const boundary = '-';
  let body = '';
  for (const part of parts) {
    body += `--${boundary}\r\n`;
    body += 'Content-Type: application/json; charset=utf-8\r\n\r\n';
    body += `${JSON.stringify(part)}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return new Response(body, {
    headers: {
      'Content-Type': `multipart/mixed; boundary="${boundary}"`,
    },
  });
}

const deferQuery = parse(/* GraphQL */ `
  query {
    product {
      name
      ... @defer {
        description
      }
    }
  }
`);

const multipartParts = [
  {
    data: { product: { name: 'Widget' } },
    hasNext: true,
  },
  {
    incremental: [
      {
        data: { description: 'slow' },
        path: ['product'],
      },
    ],
    hasNext: false,
  },
];

describe('buildHTTPExecutor mergeIncremental', () => {
  it('accumulates parts into growing snapshots by default', async () => {
    await using executor = buildHTTPExecutor({
      fetch: () => multipartResponse(multipartParts),
    });
    const result = await executor({ document: deferQuery });
    assertAsyncIterable(result);

    const chunks: unknown[] = [];
    for await (const chunk of result) {
      chunks.push(structuredClone(chunk));
    }

    expect(chunks).toHaveLength(2);
    // Second yield is the merged snapshot (description folded into data)
    expect(chunks[1]).toMatchObject({
      data: { product: { name: 'Widget', description: 'slow' } },
      hasNext: false,
    });
    // Accumulated path does not keep raw incremental on later yields
    expect(
      (chunks[1] as { incremental?: unknown }).incremental,
    ).toBeUndefined();
  });

  it('yields raw parts when mergeIncremental is false', async () => {
    await using executor = buildHTTPExecutor({
      mergeIncremental: false,
      fetch: () => multipartResponse(multipartParts),
    });
    const result = await executor({ document: deferQuery });
    assertAsyncIterable(result);

    const chunks: unknown[] = [];
    for await (const chunk of result) {
      chunks.push(structuredClone(chunk));
    }

    expect(chunks).toEqual(multipartParts);
  });

  it('merges incrementalSpec v0.2 pending/id/subPath patches', async () => {
    const v02Parts = [
      {
        data: { product: { name: 'Widget' } },
        pending: [{ id: '0', path: ['product'] }],
        hasNext: true,
      },
      {
        incremental: [
          {
            id: '0',
            subPath: [],
            data: { description: 'slow' },
          },
        ],
        completed: [{ id: '0' }],
        hasNext: false,
      },
    ];
    await using executor = buildHTTPExecutor({
      incrementalSpec: 'v0.2',
      fetch: () => multipartResponse(v02Parts),
    });
    const result = await executor({ document: deferQuery });
    assertAsyncIterable(result);

    const chunks: unknown[] = [];
    for await (const chunk of result) {
      chunks.push(structuredClone(chunk));
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toMatchObject({
      data: { product: { name: 'Widget', description: 'slow' } },
      hasNext: false,
    });
  });
});
