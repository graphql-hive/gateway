import { assertSingleExecutionValue } from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

describe('HTTP deduplication result cloning', () => {
  it('clones data for every consumer of a shared inflight request', async () => {
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
      const first = executor({ document });
      const second = executor({ document });
      finish(Response.json({ data: { node: { value: 'original' } } }));
      const [firstResult, secondResult] = await Promise.all([first, second]);
      assertSingleExecutionValue(firstResult);
      assertSingleExecutionValue(secondResult);
      expect(firstResult).toEqual({ data: { node: { value: 'original' } } });
      expect(secondResult).toEqual({ data: { node: { value: 'original' } } });
      expect(firstResult.data).not.toBe(secondResult.data);
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
