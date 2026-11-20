import { setTimeout as sleep } from 'node:timers/promises';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { usingHiveRouterRuntime } from '@internal/testing';
import { describe, expect, it } from 'vitest';

// `__experimental__rawForward` hands the bytes of a subgraph response to the
// client when the operation is eligible and the bytes check out against the
// schema. Every test compares the option off against the option on: the client
// must always get the same JSON, and the subgraph must be asked the same number
// of times. What differs is whether the bytes were used as is.

const catalogTypeDefs = /* GraphQL */ `
  scalar JSON

  enum Currency {
    USD
    EUR
  }

  interface Node {
    id: ID!
  }

  union Match = Product | Catalog

  type Query {
    catalog(first: Int = 3): Catalog!
    count: Int
    nodes: [Node!]!
    matches: [Match!]!
  }

  type Mutation {
    touch(id: ID!): Product
  }

  type Catalog implements Node {
    id: ID!
    total: Int!
    ratio: Float
    label: String
    matrix: [[Int!]!]!
    featured: Product
    products: [Product!]!
  }

  type Product implements Node @key(fields: "id") {
    id: ID!
    name: String!
    price: Float!
    tags: [String!]!
    attributes: JSON
    currency: Currency
  }
`;

const reviewsTypeDefs = /* GraphQL */ `
  type Query {
    reviewCount: Int
  }

  type Review {
    rating: Int!
  }

  type Product @key(fields: "id") {
    id: ID!
    reviews: [Review!]!
  }
`;

function makeProduct(i: number) {
  return {
    id: String(i),
    name: `Product ${i}`,
    price: i + 0.5,
    tags: ['a', 'b'],
    attributes: { color: 'red', nested: { size: [i, i + 1], ok: true } },
    currency: i % 2 ? 'USD' : 'EUR',
  };
}

const catalogResolvers = {
  Query: {
    catalog: (_: unknown, { first }: { first?: number }) => ({
      __typename: 'Catalog',
      id: 'c1',
      total: first ?? 3,
      ratio: 0.5,
      label: 'main',
      matrix: [[1, 2], [3]],
      featured: makeProduct(1),
      products: Array.from({ length: first ?? 3 }, (_, i) => ({
        __typename: 'Product',
        ...makeProduct(i + 1),
      })),
    }),
    count: () => 7,
    nodes: () => [
      { __typename: 'Product', ...makeProduct(1) },
      { __typename: 'Catalog', id: 'c1' },
    ],
    matches: () => [{ __typename: 'Product', ...makeProduct(1) }],
  },
  Mutation: {
    touch: (_: unknown, { id }: { id: string }) => makeProduct(Number(id)),
  },
};

const reviewsResolvers = {
  Query: { reviewCount: () => 1 },
  Product: {
    __resolveReference: (ref: { id: string }) => ({
      id: ref.id,
      reviews: [{ rating: 5 }, { rating: 3 }],
    }),
  },
};

type SubgraphBody = string | Uint8Array;

interface RunOptions {
  rawForward: boolean;
  query?: string;
  variables?: Record<string, unknown>;
  operationName?: string;
  /** The complete request body, in place of query / variables / operationName. */
  request?: unknown;
  /** The bytes the catalog subgraph answers with. Defaults to its own response. */
  subgraphBody?: SubgraphBody | ((real: string) => SubgraphBody);
  /** The catalog subgraph cannot be reached. */
  subgraphDown?: boolean;
  /** Delays the subgraph response so concurrent requests overlap. */
  subgraphDelayMs?: number;
  plugins?: any[];
  gatewayConfig?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Number of concurrent identical requests. */
  concurrency?: number;
}

interface RunResult {
  status: number;
  headers: Headers;
  bodyText: string;
  json: any;
  /** Whether every execution result still holds the subgraph bytes as its body. */
  forwarded: boolean;
  subgraphRequests: number;
  /** The bytes the catalog subgraph sent to the gateway. */
  subgraphBody: string;
  all: { status: number; bodyText: string }[];
}

const decoder = new TextDecoder();

async function run(options: RunOptions): Promise<RunResult> {
  const results: any[] = [];
  let subgraphRequests = 0;
  let subgraphBody = '';
  await using gateway = createGatewayTester({
    __experimental__rawForward: options.rawForward,
    ...options.gatewayConfig,
    subgraphs: [
      {
        name: 'catalog',
        schema: { typeDefs: catalogTypeDefs, resolvers: catalogResolvers },
      },
      {
        name: 'reviews',
        schema: { typeDefs: reviewsTypeDefs, resolvers: reviewsResolvers },
      },
    ],
    plugins: () => [
      ...(options.plugins ?? []),
      {
        onExecute() {
          return {
            onExecuteDone({ result }: any) {
              results.push(result);
            },
          };
        },
      },
      {
        // last, so that it wraps the fetch of the subgraph
        onFetch({ executionRequest, fetchFn, setFetchFn }: any) {
          subgraphRequests++;
          setFetchFn(async (...args: any[]) => {
            if (options.subgraphDelayMs) {
              await sleep(options.subgraphDelayMs);
            }
            if (
              options.subgraphDown &&
              executionRequest?.subgraphName === 'catalog'
            ) {
              throw new Error('connect ECONNREFUSED catalog');
            }
            const res: Response = await (fetchFn as any)(...args);
            if (executionRequest?.subgraphName !== 'catalog') {
              return res;
            }
            const real = await res.text();
            const override = options.subgraphBody;
            const body =
              override === undefined
                ? real
                : typeof override === 'function'
                  ? override(real)
                  : override;
            subgraphBody =
              typeof body === 'string' ? body : decoder.decode(body);
            return new Response(body as BodyInit, {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          });
        },
      },
    ],
  });
  const request =
    options.request ??
    ({
      query: options.query,
      variables: options.variables,
      operationName: options.operationName,
    } as unknown);
  const send = async () => {
    const res = await gateway.fetch('http://gateway/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(request),
    });
    return {
      status: res.status,
      headers: res.headers,
      bodyText: decoder.decode(await res.arrayBuffer()),
    };
  };
  const all = await Promise.all(
    Array.from({ length: options.concurrency ?? 1 }, send),
  );
  // Does not read `data`, so it does not change what the check observes.
  const forwarded =
    results.length > 0 &&
    results.every(
      (result) =>
        typeof result?.stringify === 'function' &&
        result.stringify(result) instanceof Uint8Array,
    );
  const [first] = all;
  let json: any;
  try {
    json = JSON.parse(first!.bodyText);
  } catch {
    json = undefined;
  }
  return {
    ...first!,
    json,
    forwarded,
    subgraphRequests,
    subgraphBody,
    all,
  };
}

/**
 * Runs the same request with the option off and on. The client body must be the
 * same JSON value, with the same status, and the subgraph is asked the same
 * number of times (one by default).
 */
async function compare(
  options: Omit<RunOptions, 'rawForward'>,
  expectedSubgraphRequests = 1,
) {
  const off = await run({ ...options, rawForward: false });
  const on = await run({ ...options, rawForward: true });
  expect(off.forwarded).toBe(false);
  expect(off.subgraphRequests).toBe(expectedSubgraphRequests);
  expect(on.subgraphRequests).toBe(expectedSubgraphRequests);
  expect(on.status).toBe(off.status);
  expect(on.json).toEqual(off.json);
  return { off, on };
}

/** The raw forward is not available with the router runtime: the option is a no-op there. */
const forwardedExpected = !usingHiveRouterRuntime();

const eligible = /* GraphQL */ `
  {
    catalog(first: 3) {
      id
      total
      ratio
      products {
        id
        name
        price
        tags
        attributes
        currency
      }
    }
  }
`;

describe('forwarded', () => {
  it('uses the subgraph bytes as the body, whitespace and number spelling included', async () => {
    const bytes =
      '{ "data" : { "catalog" : { "id":"c1" ,\n  "total": 2, "ratio": 1e2 } } }';
    const { off, on } = await compare({
      query: '{ catalog(first: 2) { id total ratio } }',
      subgraphBody: bytes,
    });
    expect(on.forwarded).toBe(forwardedExpected);
    if (forwardedExpected) {
      expect(on.bodyText).toBe(bytes);
      expect(on.headers.get('content-type')).toContain('application/json');
      // the regular path writes the same value in its own spelling
      expect(off.bodyText).toBe(
        '{"data":{"catalog":{"id":"c1","total":2,"ratio":100}}}',
      );
    }
    expect(on.json.data.catalog.ratio).toBe(100);
  });

  it('is identical to the subgraph body for the whole selection', async () => {
    const { on } = await compare({ query: eligible });
    expect(on.forwarded).toBe(forwardedExpected);
    if (forwardedExpected) {
      expect(on.bodyText).toBe(on.subgraphBody);
    }
  });

  it('handles a large body byte for byte', async () => {
    const { on } = await compare({
      query: eligible.replace('first: 3', 'first: 4500'),
    });
    expect(on.subgraphBody.length).toBeGreaterThan(600_000);
    expect(on.forwarded).toBe(forwardedExpected);
    if (forwardedExpected) {
      expect(on.bodyText).toBe(on.subgraphBody);
    }
    expect(on.json.data.catalog.products).toHaveLength(4500);
  });

  it.each([
    [
      'aliases below the root field',
      '{ catalog(first: 2) { ident: id n: total p: products { title: name } } }',
    ],
    [
      'fragments',
      `fragment P on Product { id name }
       { catalog(first: 2) { ...C } }
       fragment C on Catalog { id products { ...P ... on Product { price } } }`,
    ],
    [
      'nested lists and a nullable object',
      '{ catalog(first: 2) { matrix featured { id name } } }',
    ],
    [
      'a custom scalar with nested objects',
      '{ catalog(first: 2) { products { attributes } } }',
    ],
    ['an enum', '{ catalog(first: 3) { products { id currency } } }'],
    [
      '__typename first in nested selection sets',
      '{ catalog(first: 2) { __typename id products { __typename id name } } }',
    ],
  ])('forwards %s', async (_name, query) => {
    const { on } = await compare({ query });
    expect(on.forwarded).toBe(forwardedExpected);
    if (forwardedExpected) {
      expect(on.bodyText).toBe(on.subgraphBody);
    }
  });

  it('passes variables to the root field argument', async () => {
    const { on } = await compare({
      query: 'query($n: Int) { catalog(first: $n) { id total } }',
      variables: { n: 2 },
    });
    expect(on.forwarded).toBe(forwardedExpected);
    expect(on.json.data.catalog.total).toBe(2);
  });

  it('forwards the operation selected by operationName', async () => {
    const { on } = await compare({
      query: `query A { catalog(first: 1) { id total } }
              query B { catalog(first: 2) { id total } }`,
      operationName: 'B',
    });
    expect(on.forwarded).toBe(forwardedExpected);
    expect(on.json.data.catalog.total).toBe(2);
  });
});

describe('not forwarded, same result as the option off', () => {
  it.each([
    ['two root fields', '{ catalog(first: 1) { id } count }', 1],
    ['a root __typename', '{ __typename }', 0],
    ['@skip', '{ catalog(first: 1) { id total @skip(if: false) } }', 1],
    ['@include', '{ catalog(first: 1) { id total @include(if: true) } }', 1],
    ['a mutation', 'mutation { touch(id: "2") { id name } }', 1],
    ['an interface field', '{ nodes { id } }', 1],
    ['a union field', '{ matches { ... on Product { id } } }', 1],
    ['introspection', '{ __schema { queryType { name } } }', 0],
  ])('%s', async (_name, query, requests) => {
    const { on } = await compare({ query }, requests);
    expect(on.forwarded).toBe(false);
  });

  it('an alias on the root field', async () => {
    // the delegated document selects the root field without its alias
    const { on } = await compare({
      query: '{ c: catalog(first: 2) { id total } }',
    });
    expect(on.forwarded).toBe(false);
    expect(on.json.data.c.total).toBe(2);
  });

  it('a nested __typename that is not first', async () => {
    // the delegated document selects __typename first, so the subgraph keys are
    // not in the order of the client selection
    const { on } = await compare({
      query:
        '{ catalog(first: 2) { id __typename products { id __typename } } }',
    });
    expect(on.forwarded).toBe(false);
    expect(Object.keys(on.json.data.catalog)).toEqual([
      'id',
      '__typename',
      'products',
    ]);
  });

  it('needs a second subgraph', async () => {
    const { on } = await compare(
      {
        query:
          '{ catalog(first: 2) { id products { id name reviews { rating } } } }',
      },
      2,
    );
    expect(on.forwarded).toBe(false);
    expect(on.json.data.catalog.products[0].reviews).toHaveLength(2);
  });

  it('with additionalResolvers, the whole graph stays regular', async () => {
    const { on } = await compare({
      query: '{ catalog(first: 2) { id total } }',
      gatewayConfig: {
        additionalTypeDefs: /* GraphQL */ `
          extend type Catalog {
            shout: String
          }
        `,
        additionalResolvers: {
          Catalog: { shout: () => 'HEY' },
        },
      },
    });
    expect(on.forwarded).toBe(false);
  });
});

describe('subgraph bodies that are not accepted', () => {
  const query = '{ catalog(first: 1) { id total } }';
  it.each([
    [
      'errors next to data',
      '{"data":{"catalog":{"id":"c","total":1}},"errors":[{"message":"boom","path":["catalog","total"]}]}',
    ],
    [
      'null data with errors',
      '{"data":null,"errors":[{"message":"subgraph failed"}]}',
    ],
    ['null for a non-null field', '{"data":{"catalog":{"id":null,"total":1}}}'],
    ['a string for an Int', '{"data":{"catalog":{"id":"c","total":"abc"}}}'],
    ['1.0 for an Int', '{"data":{"catalog":{"id":"c","total":1.0}}}'],
    ['a number for an ID', '{"data":{"catalog":{"id":5,"total":1}}}'],
    [
      'an unknown extra key',
      '{"data":{"catalog":{"id":"c","total":1,"zzz":2}}}',
    ],
    [
      'keys in another order than selected',
      '{"data":{"catalog":{"total":1,"id":"c"}}}',
    ],
    ['invalid JSON', '{"data":{"catalog":{"id":"c","total":1}'],
    ['an empty body', ''],
    ['bytes that are not UTF-8', new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])],
  ] as [string, SubgraphBody][])('%s', async (_name, subgraphBody) => {
    const { on } = await compare({ query, subgraphBody });
    expect(on.forwarded).toBe(false);
  });

  it('an unknown enum value', async () => {
    const { on } = await compare({
      query: '{ catalog(first: 1) { products { currency } } }',
      subgraphBody: '{"data":{"catalog":{"products":[{"currency":"GBP"}]}}}',
    });
    expect(on.forwarded).toBe(false);
  });

  it('a number for an ID reaches the client as a string, as with the option off', async () => {
    const { on } = await compare({
      query,
      subgraphBody: '{"data":{"catalog":{"id":5,"total":1}}}',
    });
    // the router runtime passes the number through; it is not covered by the option
    if (forwardedExpected) {
      expect(on.json.data.catalog.id).toBe('5');
      expect(on.bodyText).not.toBe(on.subgraphBody);
    }
  });
});

describe('plugins with the option on', () => {
  const query = '{ catalog(first: 2) { id total } }';
  const bytes = '{ "data" : { "catalog" : { "id" : "c1", "total" : 2 } } }';

  it('reading result.data in onExecuteDone serializes the regular way', async () => {
    let seen: unknown;
    const { off, on } = await compare({
      query,
      subgraphBody: bytes,
      plugins: [
        {
          onExecute() {
            return {
              onExecuteDone({ result }: any) {
                seen = result.data;
              },
            };
          },
        },
      ],
    });
    expect(seen).toEqual({ catalog: { id: 'c1', total: 2 } });
    expect(on.forwarded).toBe(false);
    expect(on.bodyText).toBe(JSON.stringify(JSON.parse(bytes)));
    expect(on.bodyText).toBe(off.bodyText);
  });

  it.each([
    [
      'mutating the result',
      ({ result }: any) => {
        result.extensions = { note: 'x' };
      },
    ],
    [
      'setResult',
      ({ result, setResult }: any) => {
        setResult({ ...result, extensions: { note: 'x' } });
      },
    ],
  ])('adding extensions by %s', async (_name, onExecuteDone) => {
    const { on } = await compare({
      query,
      subgraphBody: bytes,
      plugins: [{ onExecute: () => ({ onExecuteDone }) }],
    });
    expect(on.json).toEqual({
      data: { catalog: { id: 'c1', total: 2 } },
      extensions: { note: 'x' },
    });
  });

  it('reading the subgraph result data in onSubgraphExecuteDone keeps the regular path', async () => {
    let seen: unknown;
    const { on } = await compare({
      query,
      subgraphBody: bytes,
      plugins: [
        {
          onSubgraphExecute() {
            return ({ result }: any) => {
              seen = result.data;
            };
          },
        },
      ],
    });
    expect(seen).toEqual({ catalog: { id: 'c1', total: 2 } });
    expect(on.forwarded).toBe(false);
    expect(on.bodyText).toBe(JSON.stringify(JSON.parse(bytes)));
  });

  it('an onSubgraphExecuteDone that does not read the data keeps the forward', async () => {
    let done = 0;
    const { on } = await compare({
      query,
      subgraphBody: bytes,
      plugins: [
        {
          onSubgraphExecute() {
            return () => {
              done++;
            };
          },
        },
      ],
    });
    expect(done).toBe(2);
    expect(on.forwarded).toBe(forwardedExpected);
    if (forwardedExpected) {
      expect(on.bodyText).toBe(bytes);
    }
  });

  it('runs onFetch once per subgraph request', async () => {
    let fetches = 0;
    const { on } = await compare({
      query,
      plugins: [
        {
          onFetch() {
            fetches++;
          },
        },
      ],
    });
    // one run with the option off, one with it on
    expect(fetches).toBe(2);
    expect(on.subgraphRequests).toBe(1);
  });
});

describe('other ways to answer', () => {
  const bytes = '{ "data" : { "catalog" : { "id" : "c1", "total" : 2 } } }';
  const query = '{ catalog(first: 2) { id total } }';

  it('answers a batched request with an array', async () => {
    const request = [
      { query },
      { query: '{ catalog(first: 1) { id total } }' },
    ];
    const { off, on } = await compare(
      {
        request,
        subgraphBody: bytes,
        gatewayConfig: { batching: { limit: 5 } },
      },
      2,
    );
    expect(Array.isArray(on.json)).toBe(true);
    expect(on.json).toHaveLength(2);
    expect(on.json).toEqual(off.json);
    expect(on.json[0]).toEqual({ data: { catalog: { id: 'c1', total: 2 } } });
  });

  it('answers a text/event-stream request with the same event', async () => {
    const { off, on } = await compare({
      query,
      subgraphBody: bytes,
      headers: { accept: 'text/event-stream' },
    });
    expect(on.headers.get('content-type')).toContain('text/event-stream');
    // the event carries the subgraph bytes, so compare the payload as JSON
    const payload = (text: string) =>
      text
        .split('\n')
        .filter((line) => line.startsWith('data: {'))
        .map((line) => JSON.parse(line.slice('data: '.length)));
    expect(payload(on.bodyText)).toEqual(payload(off.bodyText));
    expect(payload(on.bodyText)).toEqual([
      { data: { catalog: { id: 'c1', total: 2 } } },
    ]);
  });

  it('deduplicates concurrent identical requests', async () => {
    const off = await run({
      rawForward: false,
      query: eligible,
      concurrency: 5,
      subgraphDelayMs: 50,
    });
    const on = await run({
      rawForward: true,
      query: eligible,
      concurrency: 5,
      subgraphDelayMs: 50,
    });
    expect(off.subgraphRequests).toBe(1);
    expect(on.subgraphRequests).toBe(1);
    expect(on.all).toHaveLength(5);
    for (const res of on.all) {
      expect(JSON.parse(res.bodyText)).toEqual(off.json);
    }
    expect(on.forwarded).toBe(forwardedExpected);
  });

  it('answers the same error when the subgraph is down', async () => {
    const { on } = await compare({ query, subgraphDown: true });
    expect(on.json.errors).toBeDefined();
    expect(on.json.data ?? null).toBeNull();
    expect(on.forwarded).toBe(false);
  });
});
