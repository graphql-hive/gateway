import { assertSingleExecutionValue } from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

describe('HTTP deduplication result cloning', () => {
  it('gives every consumer of a shared inflight request its own data, cloning for all but the last', async () => {
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      let finish!: (response: Response) => void;
      const response = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      const fetch = vi.fn(() => response);
      await using executor = buildHTTPExecutor({
        endpoint: 'http://shared-clone-test/graphql',
        fetch,
      });
      const document = parse('{ node { value } }');
      const pending = [
        executor({ document }),
        executor({ document }),
        executor({ document }),
      ];
      finish(Response.json({ data: { node: { value: 'original' } } }));
      const results = await Promise.all(pending);
      for (const result of results) {
        assertSingleExecutionValue(result);
        expect(result).toEqual({ data: { node: { value: 'original' } } });
      }
      const datas = results.map((result) => (result as any).data);
      expect(new Set(datas).size).toBe(3);
      // changing one consumer's data leaves the others as they are
      datas[2].node.value = 'changed';
      expect(datas[0].node.value).toBe('original');
      expect(datas[1].node.value).toBe('original');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(clone).toHaveBeenCalledTimes(2);
    } finally {
      clone.mockRestore();
    }
  });

  it('does not clone data for a query without another in-flight consumer', async () => {
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      await using executor = buildHTTPExecutor({
        endpoint: 'http://isolated-clone-test/graphql',
        fetch: async () =>
          Response.json({ data: { node: { value: 'original' } } }),
      });
      const result = await executor({ document: parse('{ node { value } }') });
      assertSingleExecutionValue(result);
      expect(result).toEqual({ data: { node: { value: 'original' } } });
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });
});
