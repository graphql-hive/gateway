import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import type { ExecutionRequest, Executor } from '@graphql-tools/utils';
import { parse, type OperationDefinitionNode } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  registerRawForwardSchema,
  wrapExecuteFnForRawForward,
  wrapSubschemaExecutorForRawForward,
} from '../../src/rawForward';
import { buildExampleSchema } from './schema';

// The transport protocol of `@graphql-tools/executor-http`; the gateway side
// only knows the registered symbols.
const RAW_RESULT_ACCEPTOR = Symbol.for(
  '@graphql-tools/executor-http:rawResultAcceptor',
);

const query = '{ product { id name } }';
const subgraphBody = '{"data":{"product":{"id":"p1","name":"Lamp"}}}';
const subgraphData = { product: { id: 'p1', name: 'Lamp' } };

type RequestInfo = 'client' | 'other-node' | 'with-prev' | 'other-key' | 'none';

interface HarnessOptions {
  register?: boolean;
  query?: string;
  body?: string | Uint8Array;
  /** `ignores-acceptor`: the transport answers with parsed JSON. */
  transport?: 'http' | 'ignores-acceptor';
  transforms?: unknown[];
  /** One subgraph request per entry; default is one matching request. */
  requests?: { document?: string; info?: RequestInfo }[];
  /** Runs inside the execution before and after the subgraph requests. */
  beforeRequests?: (args: { contextValue?: any }) => unknown;
  afterRequests?: () => unknown;
}

// A client execution that resolves its root field through subgraph requests
// sent through the real HTTP executor over a stub `fetch`.
function createHarness(options: HarnessOptions = {}) {
  const schema = buildExampleSchema();
  if (options.register !== false) {
    registerRawForwardSchema(schema);
  }
  const clientQuery = options.query ?? query;
  const document = parse(clientQuery);
  const operation = document.definitions[0] as OperationDefinitionNode;
  const rootSelection = operation.selectionSet.selections[0] as any;
  const rootKey = (rootSelection.alias ?? rootSelection.name).value;

  const offered: boolean[] = [];
  const transportResults: any[] = [];
  let fetches = 0;
  const body = (options.body ?? subgraphBody) as BodyInit;
  const http = buildHTTPExecutor({
    endpoint: 'http://subgraph.invalid/graphql',
    fetch: async () => {
      fetches++;
      return new Response(body, {
        headers: { 'content-type': 'application/json' },
      });
    },
  }) as Executor;
  const transport: Executor = async (request) => {
    offered.push(typeof (request as any)[RAW_RESULT_ACCEPTOR] === 'function');
    const result =
      options.transport === 'ignores-acceptor'
        ? JSON.parse(String(options.body ?? subgraphBody))
        : await http(request);
    transportResults.push(result);
    return result;
  };
  const subgraphExecutor = wrapSubschemaExecutorForRawForward(
    { transforms: options.transforms as any },
    transport,
  );

  const regular = { data: { product: { id: 'regular' } } };
  const infoFor = (kind: RequestInfo = 'client') => {
    switch (kind) {
      case 'none':
        return undefined;
      case 'other-node':
        // an equal but different node
        return {
          operation: parse(clientQuery).definitions[0],
          path: { key: rootKey },
        };
      case 'with-prev':
        return { operation, path: { key: rootKey, prev: { key: 'parent' } } };
      case 'other-key':
        return { operation, path: { key: 'somethingElse' } };
      default:
        return { operation, path: { key: rootKey, prev: undefined } };
    }
  };
  const wrapped = wrapExecuteFnForRawForward(async (args: any) => {
    await options.beforeRequests?.(args);
    for (const request of options.requests ?? [{}]) {
      await subgraphExecutor({
        document: parse(request.document ?? clientQuery),
        context: args.contextValue,
        info: infoFor(request.info),
      } as unknown as ExecutionRequest);
    }
    await options.afterRequests?.();
    return regular;
  });
  const args = (contextValue: unknown) => ({ schema, document, contextValue });

  return {
    regular,
    offered,
    transportResults,
    wrapped,
    args,
    get fetches() {
      return fetches;
    },
    execute: (contextValue: unknown = {}): Promise<any> =>
      wrapped(args(contextValue)),
  };
}

// `expect(value)` would read the lazy data, so identity is compared directly.
const isForwarded = (result: any, harness: { regular: unknown }) =>
  result !== harness.regular;

// `result.stringify(result)` returns the subgraph bytes, not a string.
function expectBytes(result: any, text: string) {
  const out = result.stringify(result);
  expect(out).toBeInstanceOf(Uint8Array);
  expect(Buffer.from(out).equals(Buffer.from(text))).toBe(true);
  expect(String(out)).toBe(text);
}

describe('a forwarded result', () => {
  it('hands out the subgraph bytes while nobody has read or changed the result', async () => {
    const harness = createHarness();
    const result = await harness.execute();
    expectBytes(result, subgraphBody);
    expect(`${result.stringify(result)}`).toBe(subgraphBody);
    expect(harness.offered).toEqual([true]);
    expect(harness.fetches).toBe(1);
  });

  it('forwards the bytes as received: whitespace, multi-byte text, a view into a larger buffer', async () => {
    const text =
      ' {\n "data" : { "product" : { "id" : "p1",\t"name" : "café 😀" } }\n}\n';
    const padded = Buffer.from(`xx${text}yy`);
    for (const body of [
      text,
      padded.subarray(2, 2 + Buffer.byteLength(text)),
    ]) {
      expectBytes(await createHarness({ body }).execute(), text);
    }
  });

  it('has an enumerable data and a non-enumerable stringify', async () => {
    const result = await createHarness().execute();
    expect(Object.keys(result)).toEqual(['data']);
    expect(
      Object.getOwnPropertyDescriptor(result, 'stringify')?.enumerable,
    ).toBe(false);
    expect(result.errors).toBeUndefined();
    expect(result.extensions).toBeUndefined();
    // none of that touched the bytes
    expectBytes(result, subgraphBody);
  });

  it('parses on the first read of data and serializes as compact text from then on', async () => {
    const body =
      '{ "data" : { "product" : { "id" : "p1", "name" : "Lamp" } } }';
    const result = await createHarness({ body }).execute();
    expect(result.data).toEqual(subgraphData);
    expect(result.data).toBe(result.data);
    expect(result.stringify(result)).toBe(subgraphBody);
    result.data.product.name = 'changed';
    expect(result.stringify(result)).toBe(
      '{"data":{"product":{"id":"p1","name":"changed"}}}',
    );
  });

  it.each<[string, (result: any) => void, object]>([
    [
      'extensions are set',
      (r) => (r.extensions = { cost: 1 }),
      { extensions: { cost: 1 } },
    ],
    [
      'errors are set',
      (r) => (r.errors = [{ message: 'failed' }]),
      { errors: [{ message: 'failed' }] },
    ],
    ['errors are set to an empty list', (r) => (r.errors = []), { errors: [] }],
    [
      'data is assigned',
      (r) => (r.data = { product: null }),
      { data: { product: null } },
    ],
    ['data is assigned null', (r) => (r.data = null), { data: null }],
  ])('serializes as text once %s', async (_name, change, expected) => {
    const result = await createHarness().execute();
    change(result);
    const out = result.stringify(result);
    expect(typeof out).toBe('string');
    expect(out).toBe(JSON.stringify(result));
    expect(JSON.parse(out)).toEqual({ data: subgraphData, ...expected });
  });

  it('stringifies another object as JSON text without consuming the bytes', async () => {
    const result = await createHarness().execute();
    const other = { data: { product: { id: 'other' } } };
    expect(result.stringify(other)).toBe(JSON.stringify(other));
    expectBytes(result, subgraphBody);
  });

  it('is a plain result when spread', async () => {
    const result = await createHarness().execute();
    const copy = { ...result, extensions: { a: 1 } };
    expect(copy.stringify).toBeUndefined();
    expect(JSON.stringify(copy)).toBe(
      '{"data":{"product":{"id":"p1","name":"Lamp"}},"extensions":{"a":1}}',
    );
  });

  it('is a plain result when the transport result was read before the execution returned', async () => {
    // e.g. a plugin keeps the subgraph result and reads its data later
    const harness: ReturnType<typeof createHarness> = createHarness({
      afterRequests: () => void harness.transportResults[0].data,
    });
    const result = await harness.execute();
    expect(isForwarded(result, harness)).toBe(true);
    expect(result.stringify).toBeUndefined();
    expect(result).toEqual({ data: subgraphData });
  });

  it('forwards each execution separately, with the root alias as the key', async () => {
    const body = '{"data":{"first":{"id":"p1","name":"Lamp"}}}';
    const harness = createHarness({
      query: '{ first: product { id name } }',
      body,
    });
    const [a, b] = await Promise.all([harness.execute(), harness.execute()]);
    a.extensions = { only: 'a' };
    expect(typeof a.stringify(a)).toBe('string');
    expectBytes(b, body);
  });
});

describe('the regular result is kept', () => {
  async function expectRegular(options: HarnessOptions, offered: boolean[]) {
    const harness = createHarness(options);
    expect(await harness.execute()).toBe(harness.regular);
    expect(harness.offered).toEqual(offered);
    return harness;
  }

  it('when the schema is not registered', async () => {
    await expectRegular({ register: false }, [false]);
  });

  it('when the operation is not eligible', async () => {
    await expectRegular(
      {
        query: '{ product { id } catalog { featured { id } } }',
        requests: [{ document: query }],
      },
      [false],
    );
  });

  it('when the context is not an object', async () => {
    for (const context of [undefined, null, 'context', 7]) {
      const harness = createHarness();
      expect(await harness.wrapped(harness.args(context))).toBe(
        harness.regular,
      );
      expect(harness.offered).toEqual([false]);
    }
  });

  it('when the same context is executed again while the first execution is running', async () => {
    let reentrant: any;
    let entered = false;
    const harness: ReturnType<typeof createHarness> = createHarness({
      beforeRequests: async (args) => {
        if (!entered) {
          entered = true;
          reentrant = await harness.wrapped(harness.args(args.contextValue));
        }
      },
    });
    const outer = await harness.execute();
    expect(reentrant).toBe(harness.regular);
    // the outer execution still forwards
    expect(isForwarded(outer, harness)).toBe(true);
    expectBytes(outer, subgraphBody);
  });

  it.each<[string, RequestInfo]>([
    ['another operation node', 'other-node'],
    ['a path with a parent', 'with-prev'],
    ['another response key', 'other-key'],
    ['no info', 'none'],
  ])('when the subgraph request comes with %s', async (_name, info) => {
    await expectRegular({ requests: [{ info }] }, [false]);
  });

  it('when a second request follows a candidate that was not forwarded', async () => {
    // only the first candidate request of an execution may be forwarded
    const harness = await expectRegular(
      {
        requests: [
          { document: '{ product { id name __typename } }' },
          { document: query },
        ],
      },
      [false, false],
    );
    expect(harness.fetches).toBe(2);
  });

  it('but a request that is not a candidate does not use up the forward', async () => {
    const harness = createHarness({
      requests: [{ info: 'with-prev' }, { info: 'client' }],
    });
    expect(isForwarded(await harness.execute(), harness)).toBe(true);
    expect(harness.offered).toEqual([false, true]);
  });

  it('when the subschema has transforms', async () => {
    await expectRegular({ transforms: [{}] }, [false]);
    const harness = createHarness({ transforms: [] });
    expect(isForwarded(await harness.execute(), harness)).toBe(true);
  });

  it('when the delegated document differs from the plan', async () => {
    await expectRegular(
      { requests: [{ document: '{ product { __typename id name } }' }] },
      [false],
    );
  });

  it('when the verifier rejects the body', async () => {
    const body =
      '{"data":{"product":{"id":"p1","name":"Lamp"}},"errors":[{"message":"x"}]}';
    const harness = await expectRegular({ body }, [true]);
    // the transport parsed the body as usual
    expect(harness.fetches).toBe(1);
  });

  it('when the transport ignores the acceptor', async () => {
    await expectRegular({ transport: 'ignores-acceptor' }, [true]);
  });
});

describe('the execution state', () => {
  it('is cleared when the execution rejects, so the context can be planned again', async () => {
    let calls = 0;
    const harness = createHarness({
      afterRequests: () => {
        if (++calls === 1) throw new Error('execution failed');
      },
    });
    const context = {};
    await expect(harness.execute(context)).rejects.toThrow('execution failed');
    const result = await harness.execute(context);
    expect(isForwarded(result, harness)).toBe(true);
    expectBytes(result, subgraphBody);
  });

  it('is cleared when the execution throws synchronously', () => {
    const schema = buildExampleSchema();
    registerRawForwardSchema(schema);
    const document = parse(query);
    let calls = 0;
    const execute = wrapExecuteFnForRawForward((_args: any) => {
      if (++calls === 1) throw new Error('sync failure');
      return 'ok';
    });
    const context = {};
    expect(() => execute({ schema, document, contextValue: context })).toThrow(
      'sync failure',
    );
    expect(execute({ schema, document, contextValue: context })).toBe('ok');
  });

  it('does not mark later requests that reuse the context of a finished execution', async () => {
    const harness = createHarness();
    const context = {};
    await harness.execute(context);
    const subgraph = wrapSubschemaExecutorForRawForward({}, (async (
      request: any,
    ) => {
      expect(request[RAW_RESULT_ACCEPTOR]).toBeUndefined();
      return { data: { product: null } };
    }) as Executor);
    await subgraph({
      document: parse(query),
      context,
      info: {
        operation: parse(query).definitions[0],
        path: { key: 'product', prev: undefined },
      },
    } as unknown as ExecutionRequest);
  });

  it('wraps the same execute function once', () => {
    const execute = () => null;
    expect(wrapExecuteFnForRawForward(execute)).toBe(
      wrapExecuteFnForRawForward(execute),
    );
  });
});
