import {
  getRawResponseBytes,
  requestRawResponse,
} from '@graphql-tools/executor-common';
import { assertSingleExecutionValue } from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

const body = '{"data":{"node":{"value":"v"}}}';
const document = parse('{ node { value } }');

describe('raw responses', () => {
  it('gives the body as bytes when asked for, parsed only when read', async () => {
    await using executor = buildHTTPExecutor({
      endpoint: 'http://raw-test/graphql',
      fetch: async () =>
        new Response(body, {
          headers: { 'content-type': 'application/json' },
        }),
    });
    const result = await executor(requestRawResponse({ document }));
    assertSingleExecutionValue(result);
    expect(new TextDecoder().decode(getRawResponseBytes(result))).toBe(body);
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ node: { value: 'v' } });
  });

  it('parses like before when not asked for, or the response failed', async () => {
    const respond = (status: number) => async () =>
      new Response('{"data":null,"errors":[{"message":"boom"}]}', {
        status,
        headers: { 'content-type': 'application/json' },
      });
    await using ok = buildHTTPExecutor({
      endpoint: 'http://raw-test/graphql',
      fetch: respond(200),
    });
    const plain = await ok({ document });
    assertSingleExecutionValue(plain);
    expect(getRawResponseBytes(plain)).toBeUndefined();

    await using failing = buildHTTPExecutor({
      endpoint: 'http://raw-test/graphql',
      fetch: respond(500),
    });
    const failed = await failing(requestRawResponse({ document }));
    assertSingleExecutionValue(failed);
    expect(getRawResponseBytes(failed)).toBeUndefined();
    expect(failed.errors?.[0]?.message).toBe('boom');
  });

  it('gives every consumer of a shared inflight request the bytes, and its own data', async () => {
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetch = vi.fn(() => response);
    await using executor = buildHTTPExecutor({
      endpoint: 'http://raw-shared-test/graphql',
      fetch,
    });
    const pending = [1, 2, 3].map(() =>
      executor(requestRawResponse({ document })),
    );
    finish(
      new Response(body, { headers: { 'content-type': 'application/json' } }),
    );
    const results = await Promise.all(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    const bytes = results.map((result) => getRawResponseBytes(result as any));
    expect(bytes[0]).toBeDefined();
    expect(new Set(bytes).size).toBe(1);
    const datas = results.map((result) => (result as any).data);
    expect(new Set(datas).size).toBe(3);
    datas[0].node.value = 'changed';
    expect(datas[1]).toEqual({ node: { value: 'v' } });
  });
});
