import { getEventListeners } from 'node:events';
import { assertSingleExecutionValue } from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

function createSharedRequest(body: string) {
  let finish!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetch = vi.fn(() => response);
  return {
    fetch,
    finish: () =>
      finish(
        new Response(body, {
          headers: { 'content-type': 'application/json' },
        }),
      ),
  };
}

describe('HTTP deduplication result copying', () => {
  it('gives every consumer of a shared inflight request its own data', async () => {
    const { fetch, finish } = createSharedRequest(
      JSON.stringify({ data: { node: { value: 'original', list: [1] } } }),
    );
    await using executor = buildHTTPExecutor({
      endpoint: 'http://shared-copy-test/graphql',
      fetch,
    });
    const document = parse('{ node { value list } }');
    const pending = [
      executor({ document }),
      executor({ document }),
      executor({ document }),
    ];
    finish();
    const results = await Promise.all(pending);
    for (const result of results) {
      assertSingleExecutionValue(result);
      expect(result).toEqual({
        data: { node: { value: 'original', list: [1] } },
      });
    }
    const datas = results.map((result) => (result as any).data);
    expect(new Set(datas).size).toBe(3);
    // changing one consumer's data leaves the others as they are
    datas[2].node.value = 'changed';
    datas[2].node.list.push(2);
    for (const data of datas.slice(0, 2)) {
      expect(data).toEqual({ node: { value: 'original', list: [1] } });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('leaves no listener on the request signal once the result is in', async () => {
    await using executor = buildHTTPExecutor({
      endpoint: 'http://signal-release-test/graphql',
      fetch: async () => Response.json({ data: { node: { value: 'v' } } }),
    });
    const ctrl = new AbortController();
    for (let i = 0; i < 3; i++) {
      const result = await executor({
        document: parse('{ node { value } }'),
        signal: ctrl.signal,
      });
      assertSingleExecutionValue(result);
      expect(result.data).toEqual({ node: { value: 'v' } });
    }
    // every request combined it with the executor's own signal, and let go of it once done
    expect(getEventListeners(ctrl.signal, 'abort')).toHaveLength(0);
  });

  it('keeps an own __proto__ key of the response as data in the copies', async () => {
    const { fetch, finish } = createSharedRequest(
      '{"data":{"node":{"__proto__":{"polluted":true},"value":"original"}}}',
    );
    await using executor = buildHTTPExecutor({
      endpoint: 'http://shared-proto-test/graphql',
      fetch,
    });
    const document = parse('{ node { value } }');
    const pending = [executor({ document }), executor({ document })];
    finish();
    for (const result of await Promise.all(pending)) {
      assertSingleExecutionValue(result);
      const node = (result as any).data.node;
      expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
      expect(Object.hasOwn(node, '__proto__')).toBe(true);
      expect(node.polluted).toBeUndefined();
    }
  });
});
