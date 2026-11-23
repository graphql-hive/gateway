import type { ExecutionResult } from '@graphql-tools/utils';
import { assertSingleExecutionValue } from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { GraphQLError, parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import {
  buildHTTPExecutor,
  getRawResultBody,
  RAW_RESULT_ACCEPTOR,
  type RawResultAcceptor,
} from '../src/index.js';
import { readRawResultOrText } from '../src/rawResult.js';

const document = parse('{ products { name price } }');
const data = { products: [{ name: 'Widget', price: 10 }] };
const bodyText = JSON.stringify({ data });
const bodyBytes = Array.from(new TextEncoder().encode(bodyText));

// the executor may hand back a Buffer, so compare as plain arrays
const toBytes = (body: Uint8Array | undefined) => body && Array.from(body);

function jsonResponse(body: string) {
  return new Response(body, {
    headers: { 'content-type': 'application/json' },
  });
}

async function execute(
  body: string,
  acceptor?: RawResultAcceptor,
  options: {
    retry?: number;
    exposeHTTPDetailsInExtensions?: boolean;
    fetch?: () => Promise<Response>;
  } = {},
): Promise<ExecutionResult> {
  await using executor = buildHTTPExecutor({
    endpoint: 'http://raw-result-test/graphql',
    fetch: async () => jsonResponse(body),
    ...options,
  });
  const request: any = { document };
  if (acceptor) {
    request[RAW_RESULT_ACCEPTOR] = acceptor;
  }
  const result = await executor(request);
  assertSingleExecutionValue(result);
  return result;
}

describe('raw result', () => {
  describe('without an acceptor', () => {
    it('returns a plain parsed result', async () => {
      const result = await execute(bodyText);
      expect(result).toEqual({ data });
      expect(getRawResultBody(result)).toBeUndefined();
      expect(
        Object.getOwnPropertyDescriptor(result, 'data')?.get,
      ).toBeUndefined();
    });

    it('ignores a non-function acceptor', async () => {
      await using executor = buildHTTPExecutor({
        endpoint: 'http://raw-result-test/graphql',
        fetch: async () => jsonResponse(bodyText),
      });
      const result = await executor({
        document,
        [RAW_RESULT_ACCEPTOR]: true,
      } as any);
      assertSingleExecutionValue(result);
      expect(result).toEqual({ data });
      expect(getRawResultBody(result)).toBeUndefined();
    });
  });

  describe('when the acceptor accepts', () => {
    it('calls the acceptor once with the exact body and exposes the bytes', async () => {
      const acceptor = vi.fn<RawResultAcceptor>(() => true);
      const result = await execute(bodyText, acceptor);
      expect(acceptor).toHaveBeenCalledTimes(1);
      expect(toBytes(acceptor.mock.calls[0]![0])).toEqual(bodyBytes);
      expect(toBytes(getRawResultBody(result))).toEqual(bodyBytes);
    });

    it('does not parse the body in the executor', async () => {
      const parse = vi.spyOn(JSON, 'parse');
      try {
        const result = await execute(bodyText, () => true);
        expect(parse).not.toHaveBeenCalled();
        expect(toBytes(getRawResultBody(result))).toEqual(bodyBytes);
      } finally {
        parse.mockRestore();
      }
    });

    it('parses lazily on first read and then keeps a stable, writable data', async () => {
      const result = await execute(bodyText, () => true);
      expect(result).toEqual({ data });
      expect(getRawResultBody(result)).toBeUndefined();
      const first = result.data;
      expect(result.data).toBe(first);
      const replacement = { products: [] };
      result.data = replacement;
      expect(result.data).toBe(replacement);
    });

    it('drops the body when data is assigned before being read', async () => {
      const result = await execute(bodyText, () => true);
      expect(toBytes(getRawResultBody(result))).toEqual(bodyBytes);
      const replacement = { products: [] };
      result.data = replacement;
      expect(getRawResultBody(result)).toBeUndefined();
      expect(result.data).toBe(replacement);
    });

    it('has only an enumerable data key and spreads to the parsed data', async () => {
      const result = await execute(bodyText, () => true);
      expect(Object.keys(result)).toEqual(['data']);
      expect(toBytes(getRawResultBody(result))).toEqual(bodyBytes);
      expect({ ...result }).toEqual({ data });
    });

    it('works when the response only has arrayBuffer()', async () => {
      const response = jsonResponse(bodyText);
      const readable = {
        arrayBuffer: () => response.arrayBuffer(),
        text: () => {
          throw new Error('text() must not be used');
        },
      };
      const acceptor = vi.fn(() => true);
      const result = await readRawResultOrText(readable, acceptor);
      expect(acceptor).toHaveBeenCalledTimes(1);
      expect(toBytes(getRawResultBody(result as ExecutionResult))).toEqual(
        bodyBytes,
      );
      expect(result).toEqual({ data });
    });

    it('works through the executor for a response without bytes()', async () => {
      const acceptor = vi.fn(() => true);
      const result = await execute(bodyText, acceptor, {
        fetch: async () => {
          const response = jsonResponse(bodyText);
          Object.defineProperty(response, 'bytes', { value: undefined });
          return response;
        },
      });
      expect(acceptor).toHaveBeenCalledTimes(1);
      expect(toBytes(getRawResultBody(result))).toEqual(bodyBytes);
    });
  });

  describe('when the acceptor rejects', () => {
    const cases: Record<string, string> = {
      'invalid JSON': 'not json {',
      'null data without errors': JSON.stringify({ data: null }),
      'an errors array': JSON.stringify({
        data: null,
        errors: [{ message: 'boom', path: ['products'] }],
      }),
      'an empty body': '',
    };

    for (const [name, body] of Object.entries(cases)) {
      it(`matches the result without an acceptor for ${name}`, async () => {
        const acceptor = vi.fn(() => false);
        const withAcceptor = await execute(body, acceptor);
        const without = await execute(body);
        expect(acceptor).toHaveBeenCalledTimes(1);
        expect(withAcceptor).toEqual(without);
        expect(getRawResultBody(withAcceptor)).toBeUndefined();
        for (const error of withAcceptor.errors ?? []) {
          expect(error).toBeInstanceOf(GraphQLError);
        }
      });
    }

    it('returns GraphQLError instances for a body with errors', async () => {
      const result = await execute(cases['an errors array']!, () => false);
      expect(result.errors?.[0]).toBeInstanceOf(GraphQLError);
      expect(result.errors?.[0]?.message).toBe('boom');
    });

    it('parses a valid body into a plain object', async () => {
      const result = await execute(bodyText, () => false);
      expect(result).toEqual({ data });
      expect(getRawResultBody(result)).toBeUndefined();
    });
  });

  describe('text-only responses', () => {
    it('falls back to text() without calling the acceptor', async () => {
      const acceptor = vi.fn(() => true);
      const result = await readRawResultOrText(
        { text: () => bodyText },
        acceptor,
      );
      expect(result).toBe(bodyText);
      expect(acceptor).not.toHaveBeenCalled();
    });
  });

  describe('exposeHTTPDetailsInExtensions', () => {
    it('disables the raw path', async () => {
      const acceptor = vi.fn(() => true);
      const result = await execute(bodyText, acceptor, {
        exposeHTTPDetailsInExtensions: true,
      });
      const withoutAcceptor = await execute(bodyText, undefined, {
        exposeHTTPDetailsInExtensions: true,
      });
      expect(acceptor).not.toHaveBeenCalled();
      expect(getRawResultBody(result)).toBeUndefined();
      expect(result).toEqual(withoutAcceptor);
      expect(result.extensions).toBeDefined();
    });
  });

  describe('retry', () => {
    it('does not offer a non-2xx body to the acceptor', async () => {
      let calls = 0;
      const acceptor = vi.fn(() => true);
      const result = await execute(bodyText, acceptor, {
        retry: 2,
        fetch: async () =>
          ++calls === 1
            ? new Response('{"data":{"oops":1}}', {
                status: 500,
                headers: { 'content-type': 'application/json' },
              })
            : jsonResponse(bodyText),
      });
      expect(calls).toBe(2);
      expect(acceptor).toHaveBeenCalledTimes(1);
      expect(toBytes(getRawResultBody(result))).toEqual(bodyBytes);
    });
  });

  describe('deduplicated in-flight requests', () => {
    function setup() {
      let finish!: (response: Response) => void;
      const pending = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      const fetch = vi.fn(() => pending);
      const executor = buildHTTPExecutor({
        endpoint: 'http://raw-result-dedup-test/graphql',
        fetch,
      });
      const run = (acceptor?: RawResultAcceptor) => {
        const request: any = { document };
        if (acceptor) {
          request[RAW_RESULT_ACCEPTOR] = acceptor;
        }
        return executor(request);
      };
      return { fetch, run, finish: () => finish(jsonResponse(bodyText)) };
    }

    async function settle(...results: Promise<unknown>[]) {
      const values = (await Promise.all(results)) as ExecutionResult[];
      values.forEach((value) => assertSingleExecutionValue(value as any));
      return values;
    }

    it('gives every consumer its own raw result without structuredClone', async () => {
      const clone = vi.spyOn(globalThis, 'structuredClone');
      try {
        const { fetch, run, finish } = setup();
        const acceptor = vi.fn(() => true);
        const first = run(acceptor);
        const second = run(acceptor);
        finish();
        const [a, b] = await settle(first, second);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(acceptor).toHaveBeenCalledTimes(1);
        expect(toBytes(getRawResultBody(a))).toEqual(bodyBytes);
        expect(toBytes(getRawResultBody(b))).toEqual(bodyBytes);
        expect(clone).not.toHaveBeenCalled();
        expect(Object.is(a, b)).toBe(false);

        (a!.data as any).products[0].name = 'Changed';
        expect(a!.data).not.toBe(b!.data);
        expect(b).toEqual({ data });
      } finally {
        clone.mockRestore();
      }
    });

    it('gives a consumer without an acceptor a parsed object', async () => {
      const { fetch, run, finish } = setup();
      const acceptor = vi.fn(() => true);
      const first = run(acceptor);
      const second = run();
      finish();
      const [a, b] = await settle(first, second);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(toBytes(getRawResultBody(a))).toEqual(bodyBytes);
      expect(getRawResultBody(b)).toBeUndefined();
      expect(Object.getOwnPropertyDescriptor(b, 'data')?.get).toBeUndefined();
      expect(b).toEqual({ data });
    });

    it('gives a consumer whose acceptor rejects a parsed object', async () => {
      const { run, finish } = setup();
      const second = vi.fn(() => false);
      const first = run(() => true);
      const rejected = run(second);
      finish();
      const [a, b] = await settle(first, rejected);
      expect(second).toHaveBeenCalledTimes(1);
      expect(toBytes(getRawResultBody(a))).toEqual(bodyBytes);
      expect(getRawResultBody(b)).toBeUndefined();
      expect(b).toEqual({ data });
    });

    it("keeps today's cloned plain results when the first consumer has no acceptor", async () => {
      const { fetch, run, finish } = setup();
      const acceptor = vi.fn(() => true);
      const first = run();
      const second = run(acceptor);
      finish();
      const [a, b] = await settle(first, second);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(acceptor).not.toHaveBeenCalled();
      expect(getRawResultBody(a)).toBeUndefined();
      expect(getRawResultBody(b)).toBeUndefined();
      expect(a).toEqual({ data });
      expect(b).toEqual({ data });
      expect(a!.data).not.toBe(b!.data);
    });
  });
});
