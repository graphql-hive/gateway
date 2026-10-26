import { assertSingleExecutionValue } from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

describe('HTTP deduplication result cloning', () => {
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

  it('isolates all consumers of a shared request, including across executor instances', async () => {
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      let finish!: (response: Response) => void;
      const response = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      const fetchA = vi.fn(() => response);
      const fetchB = vi.fn(async () =>
        Response.json({ data: { node: { value: 'unexpected second fetch' } } }),
      );
      const endpoint = 'http://shared-clone-test/graphql';
      await using executorA = buildHTTPExecutor({ endpoint, fetch: fetchA });
      await using executorB = buildHTTPExecutor({ endpoint, fetch: fetchB });
      const document = parse('{ node { value } }');
      const first = Promise.resolve(executorA({ document })).then((result) => {
        assertSingleExecutionValue(result);
        const data = result.data as { node: { value: string } };
        data.node.value = 'mutated before later consumers resume';
        return result;
      });
      const second = executorB({ document });
      const third = executorA({ document });
      finish(Response.json({ data: { node: { value: 'original' } } }));
      const results = await Promise.all([first, second, third]);
      for (const result of results.slice(1)) {
        assertSingleExecutionValue(result);
        expect(result).toEqual({ data: { node: { value: 'original' } } });
      }
      expect(fetchA).toHaveBeenCalledTimes(1);
      expect(fetchB).not.toHaveBeenCalled();
      expect(clone).toHaveBeenCalledTimes(3);
    } finally {
      clone.mockRestore();
    }
  });
});
