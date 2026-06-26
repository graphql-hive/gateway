import { setTimeout as delay } from 'node:timers/promises';
import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  type GatewayRuntime,
} from '@graphql-hive/gateway-runtime';
import { createDeferred } from '@graphql-tools/utils';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
} from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

/**
 * Behavioral (black-box) tests for graceful supergraph reload ("generation
 * overlap"). Everything is driven through the public gateway runtime against
 * REAL upstream HTTP servers — no mocks, no inspection of internals. The only
 * thing observed is the HTTP response a client would get.
 *
 * The scenario: a request is made to block inside an upstream resolver (so it is
 * provably in-flight), the supergraph is reloaded to a DIFFERENT upstream while
 * that request is blocked, then the blocked resolver is released. With graceful
 * reload, the in-flight operation must finish on the OLD generation and return
 * the OLD upstream's value (`fromA`). Without it (default), the operation is
 * aborted with SCHEMA_RELOAD: queries are retried on the new generation
 * (`fromB`) and mutations fail outright.
 */

const TYPE_DEFS = /* GraphQL */ `
  type Query {
    ping: String
    slow: String
  }
  type Mutation {
    slowMutation: String
  }
`;

const GW_URL = 'http://gateway/graphql';
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

async function runOperation(
  gw: GatewayRuntime,
  query: string,
): Promise<{ data?: Record<string, unknown> | null; errors?: unknown[] }> {
  const response = await gw.fetch(GW_URL, {
    method: 'POST',
    body: JSON.stringify({ query }),
    headers: JSON_HEADERS,
  });
  return response.json() as Promise<{
    data?: Record<string, unknown> | null;
    errors?: unknown[];
  }>;
}

/** Drive the lazy poller until the gateway serves the expected generation. */
async function waitForGeneration(
  gw: GatewayRuntime,
  expected: string,
  { attempts = 80, gap = 75 }: { attempts?: number; gap?: number } = {},
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const result = await runOperation(
      gw,
      /* GraphQL */ `
        {
          ping
        }
      `,
    );
    if (result.data?.['ping'] === expected) {
      return;
    }
    await delay(gap);
  }
  throw new Error(`supergraph never reloaded to "${expected}"`);
}

describe('Graceful schema reload (generation overlap)', () => {
  it('completes an in-flight QUERY on the previous generation instead of retrying on the new one', async () => {
    const slowEntered = createDeferred<void>();
    const releaseSlow = createDeferred<string>();

    const schemaA = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: {
          ping: () => 'genA',
          slow: () => {
            slowEntered.resolve();
            return releaseSlow.promise;
          },
        },
      },
    });
    const schemaB = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: { ping: () => 'genB', slow: () => 'fromB' },
      },
    });

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);

    let useSecond = false;
    await using gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      gracefulSchemaReload: { drainTimeout: 10_000 },
      logging: false,
    });

    // Generation A is live.
    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    // Start a request that blocks inside generation A's upstream.
    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        {
          slow
        }
      `,
    );
    await slowEntered.promise;

    // Reload to generation B while the request is blocked.
    useSecond = true;
    await waitForGeneration(gw, 'genB');

    // Release the blocked resolver; the in-flight request must finish on A.
    releaseSlow.resolve('fromA');
    const result = await inFlight;

    expect(result.errors).toBeUndefined();
    expect(result.data?.['slow']).toBe('fromA');
  });

  it('completes an in-flight MUTATION across a schema reload (mutations are never retried)', async () => {
    const mutationEntered = createDeferred<void>();
    const releaseMutation = createDeferred<string>();

    const schemaA = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: { ping: () => 'genA' },
        Mutation: {
          slowMutation: () => {
            mutationEntered.resolve();
            return releaseMutation.promise;
          },
        },
      },
    });
    const schemaB = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: { ping: () => 'genB' },
        Mutation: { slowMutation: () => 'fromB' },
      },
    });

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);

    let useSecond = false;
    await using gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      gracefulSchemaReload: { drainTimeout: 10_000 },
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        mutation {
          slowMutation
        }
      `,
    );
    await mutationEntered.promise;

    useSecond = true;
    await waitForGeneration(gw, 'genB');

    releaseMutation.resolve('fromA');
    const result = await inFlight;

    expect(result.errors).toBeUndefined();
    expect(result.data?.['slowMutation']).toBe('fromA');
  });

  it('force-disposes the previous generation after the drain timeout', async () => {
    const slowEntered = createDeferred<void>();
    const releaseSlow = createDeferred<string>();

    const schemaA = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: {
          ping: () => 'genA',
          slow: () => {
            slowEntered.resolve();
            return releaseSlow.promise;
          },
        },
      },
    });
    const schemaB = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: { Query: { ping: () => 'genB', slow: () => 'fromB' } },
    });

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);

    let useSecond = false;
    await using gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      gracefulSchemaReload: { drainTimeout: 500 },
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        {
          slow
        }
      `,
    );
    await slowEntered.promise;

    useSecond = true;
    await waitForGeneration(gw, 'genB');

    // Do NOT release until well past the drain timeout: the previous generation
    // must be force-disposed, aborting the in-flight query which is then retried
    // on the new generation.
    await delay(1500);
    releaseSlow.resolve('fromA');
    const result = await inFlight;

    expect(result.data?.['slow']).toBe('fromB');
  });

  it('caps concurrent generations — cap of 1 disables overlap', async () => {
    const slowEntered = createDeferred<void>();
    const releaseSlow = createDeferred<string>();

    const schemaA = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: {
          ping: () => 'genA',
          slow: () => {
            slowEntered.resolve();
            return releaseSlow.promise;
          },
        },
      },
    });
    const schemaB = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: { Query: { ping: () => 'genB', slow: () => 'fromB' } },
    });

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);

    let useSecond = false;
    await using gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      gracefulSchemaReload: {
        drainTimeout: 10_000,
        maxConcurrentGenerations: 1,
      },
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        {
          slow
        }
      `,
    );
    await slowEntered.promise;

    useSecond = true;
    await waitForGeneration(gw, 'genB');

    releaseSlow.resolve('fromA');
    const result = await inFlight;

    // With only one generation allowed, the previous generation cannot overlap;
    // it is disposed at reload and the query is retried on the new generation.
    expect(result.data?.['slow']).toBe('fromB');
  });

  it('does not overlap when graceful reload is not configured (opt-in)', async () => {
    const slowEntered = createDeferred<void>();
    const releaseSlow = createDeferred<string>();

    const schemaA = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: {
          ping: () => 'genA',
          slow: () => {
            slowEntered.resolve();
            return releaseSlow.promise;
          },
        },
      },
    });
    const schemaB = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: { Query: { ping: () => 'genB', slow: () => 'fromB' } },
    });

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);

    let useSecond = false;
    await using gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      // graceful reload intentionally NOT configured
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        {
          slow
        }
      `,
    );
    await slowEntered.promise;

    useSecond = true;
    await waitForGeneration(gw, 'genB');

    releaseSlow.resolve('fromA');
    const result = await inFlight;

    // Without graceful reload the previous generation is disposed immediately,
    // so the in-flight query is aborted and retried on the new generation.
    expect(result.data?.['slow']).toBe('fromB');
  });

  it('disposes draining generations on shutdown (aborts their in-flight work)', async () => {
    const mutationEntered = createDeferred<void>();
    const releaseMutation = createDeferred<string>();

    const schemaA = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: { ping: () => 'genA' },
        Mutation: {
          slowMutation: () => {
            mutationEntered.resolve();
            return releaseMutation.promise;
          },
        },
      },
    });
    const schemaB = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: { ping: () => 'genB' },
        Mutation: { slowMutation: () => 'fromB' },
      },
    });

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);

    let useSecond = false;
    // Not `await using`: the gateway is disposed explicitly mid-test.
    const gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      gracefulSchemaReload: { drainTimeout: 30_000 },
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    // A mutation blocks inside generation A, then a reload makes generation A a
    // draining generation that is kept alive (drain timeout is long).
    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        mutation {
          slowMutation
        }
      `,
    );
    await mutationEntered.promise;
    useSecond = true;
    await waitForGeneration(gw, 'genB');

    // Shutting down must dispose ALL live generations — including the draining
    // one — so the blocked mutation is aborted and disposal completes.
    const disposed = gw[DisposableSymbols.asyncDispose]();
    const result = await inFlight;
    await disposed;

    expect(result.errors).toBeDefined();
    expect(result.data?.['slowMutation']).not.toBe('fromA');
    // On shutdown a draining generation's in-flight work must abort with
    // SHUTTING_DOWN (not SCHEMA_RELOAD, which would invite a retry into a
    // shutting-down gateway).
    expect(JSON.stringify(result.errors)).toContain('SHUTTING_DOWN');

    // Release the upstream resolver so the upstream server can shut down cleanly.
    releaseMutation.resolve('fromA');
  });

  it('completes an in-flight MULTI-HOP operation across a reload', async () => {
    const hop1Entered = createDeferred<void>();
    const releaseHop1 = createDeferred<void>();

    // Subgraph "products": owns Product and the blocking mutation (hop 1).
    const productsSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          ping: String
        }
        type Mutation {
          makeProduct: Product
        }
        type Product @key(fields: "id") {
          id: ID!
        }
      `),
      resolvers: {
        Query: { ping: () => 'genA' },
        Mutation: {
          makeProduct: async () => {
            hop1Entered.resolve();
            await releaseHop1.promise;
            return { id: '1' };
          },
        },
      },
    });
    // Subgraph "reviews": resolves Product.review via an entity reference (hop 2).
    const reviewsSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _reviewsPing: String
        }
        type Product @key(fields: "id") {
          id: ID!
          review: String
        }
      `),
      resolvers: {
        Product: {
          __resolveReference: (ref: { id: string }) => ({
            id: ref.id,
            review: 'reviewFromReviews',
          }),
        },
      },
    });
    // The reload target — a different, unrelated supergraph.
    const otherSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          ping: String
        }
      `),
      resolvers: { Query: { ping: () => 'genB' } },
    });

    await using productsYoga = createYoga({
      schema: productsSchema,
      logging: false,
    });
    await using productsServer = await createDisposableServer(productsYoga);
    await using reviewsYoga = createYoga({
      schema: reviewsSchema,
      logging: false,
    });
    await using reviewsServer = await createDisposableServer(reviewsYoga);
    await using otherYoga = createYoga({ schema: otherSchema, logging: false });
    await using otherServer = await createDisposableServer(otherYoga);

    const sdlA = await composeLocalSchemasWithApollo([
      {
        name: 'products',
        schema: productsSchema,
        url: `${productsServer.url}/graphql`,
      },
      {
        name: 'reviews',
        schema: reviewsSchema,
        url: `${reviewsServer.url}/graphql`,
      },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'other', schema: otherSchema, url: `${otherServer.url}/graphql` },
    ]);

    let useSecond = false;
    await using gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      gracefulSchemaReload: { drainTimeout: 30_000 },
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    // A multi-hop mutation: hop 1 in "products" (blocks), then hop 2 resolves
    // `review` from "reviews" via an entity reference.
    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        mutation {
          makeProduct {
            id
            review
          }
        }
      `,
    );
    await hop1Entered.promise;

    // Reload while the mutation is in flight on its (now previous) generation.
    useSecond = true;
    await waitForGeneration(gw, 'genB');

    releaseHop1.resolve();
    const result = await inFlight;

    // Both hops must complete on the original generation — the generation must
    // not be disposed in the gap between hop 1 finishing and hop 2 starting.
    expect(result.errors).toBeUndefined();
    expect(result.data?.['makeProduct']).toEqual({
      id: '1',
      review: 'reviewFromReviews',
    });
  });

  it('does not overlap an in-flight MUTATION when graceful reload is not configured (default-off)', async () => {
    const mutationEntered = createDeferred<void>();
    const releaseMutation = createDeferred<string>();

    const schemaA = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: { ping: () => 'genA' },
        Mutation: {
          slowMutation: () => {
            mutationEntered.resolve();
            return releaseMutation.promise;
          },
        },
      },
    });
    const schemaB = buildSubgraphSchema({
      typeDefs: parse(TYPE_DEFS),
      resolvers: {
        Query: { ping: () => 'genB' },
        Mutation: { slowMutation: () => 'fromB' },
      },
    });

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);

    let useSecond = false;
    await using gw = createGatewayRuntime({
      supergraph: () => (useSecond ? sdlB : sdlA),
      pollingInterval: 100,
      // graceful reload intentionally NOT configured
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    const inFlight = runOperation(
      gw,
      /* GraphQL */ `
        mutation {
          slowMutation
        }
      `,
    );
    await mutationEntered.promise;

    useSecond = true;
    await waitForGeneration(gw, 'genB');

    releaseMutation.resolve('fromA');
    const result = await inFlight;

    // Without graceful reload the in-flight mutation is aborted on reload and,
    // unlike a query, is NOT retried — so it surfaces a SCHEMA_RELOAD error.
    expect(result.data?.['slowMutation']).not.toBe('fromA');
    expect(JSON.stringify(result.errors)).toContain('SCHEMA_RELOAD');
  });

  it('overlaps multiple generations and force-disposes the OLDEST when the cap is exceeded', async () => {
    const slowAEntered = createDeferred<void>();
    const releaseSlowA = createDeferred<string>();
    const slowBEntered = createDeferred<void>();
    const releaseSlowB = createDeferred<string>();

    const makeSchema = (gen: string, slow: () => string | Promise<string>) =>
      buildSubgraphSchema({
        typeDefs: parse(TYPE_DEFS),
        resolvers: { Query: { ping: () => gen, slow } },
      });
    const schemaA = makeSchema('genA', () => {
      slowAEntered.resolve();
      return releaseSlowA.promise;
    });
    const schemaB = makeSchema('genB', () => {
      slowBEntered.resolve();
      return releaseSlowB.promise;
    });
    const schemaC = makeSchema('genC', () => 'fromC');

    await using yogaA = createYoga({ schema: schemaA, logging: false });
    await using serverA = await createDisposableServer(yogaA);
    await using yogaB = createYoga({ schema: schemaB, logging: false });
    await using serverB = await createDisposableServer(yogaB);
    await using yogaC = createYoga({ schema: schemaC, logging: false });
    await using serverC = await createDisposableServer(yogaC);

    const sdlA = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaA, url: `${serverA.url}/graphql` },
    ]);
    const sdlB = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaB, url: `${serverB.url}/graphql` },
    ]);
    const sdlC = await composeLocalSchemasWithApollo([
      { name: 'upstream', schema: schemaC, url: `${serverC.url}/graphql` },
    ]);

    let current = sdlA;
    await using gw = createGatewayRuntime({
      supergraph: () => current,
      pollingInterval: 100,
      // current + 1 draining generation may coexist; a 2nd draining one evicts
      // the oldest.
      gracefulSchemaReload: {
        drainTimeout: 30_000,
        maxConcurrentGenerations: 2,
      },
      logging: false,
    });

    expect((await runOperation(gw, `{ ping }`)).data?.['ping']).toBe('genA');

    // Block an operation on generation A, then reload to B (A starts draining).
    const inFlightA = runOperation(
      gw,
      /* GraphQL */ `
        {
          slow
        }
      `,
    );
    await slowAEntered.promise;
    current = sdlB;
    await waitForGeneration(gw, 'genB');

    // Block an operation on generation B, then reload to C. Draining is now
    // {A, B}, which exceeds the cap (current C + 1), so the OLDEST draining
    // generation (A) is force-disposed while B keeps draining.
    const inFlightB = runOperation(
      gw,
      /* GraphQL */ `
        {
          slow
        }
      `,
    );
    await slowBEntered.promise;
    current = sdlC;
    await waitForGeneration(gw, 'genC');

    // B was within the cap, so it overlapped and completes on its own generation.
    releaseSlowB.resolve('fromB');
    const resultB = await inFlightB;
    expect(resultB.errors).toBeUndefined();
    expect(resultB.data?.['slow']).toBe('fromB');

    // A was evicted (force-disposed) when the cap was exceeded, so it was aborted
    // and retried on the current generation (C).
    releaseSlowA.resolve('fromA');
    const resultA = await inFlightA;
    expect(resultA.data?.['slow']).toBe('fromC');
  });
});
