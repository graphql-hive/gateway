import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@graphql-hive/logger';
import type { KeyValueCache } from '@graphql-mesh/types';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDevFetcher,
  DEFAULT_HIVE_REGISTRY_ENDPOINT,
  InvalidSupergraphResultError,
  LocalSupergraphCompositionError,
  RemoteSupergraphCompositionError,
  SupergraphRegistryApiError,
  type DevFetcher,
} from '../src/fetchers/dev';
import type { GatewayConfigContext, GatewayHiveDevOptions } from '../src/types';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function sentBody(init: RequestInit | undefined) {
  return JSON.parse(init?.body as string);
}

function createMemoryCache(): KeyValueCache {
  const store = new Map<string, unknown>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => {
      store.set(key, value);
    },
    delete: (key) => store.delete(key),
    getKeysByPrefix: (prefix) =>
      [...store.keys()].filter((key) => key.startsWith(prefix)),
  };
}

const tempDirs: string[] = [];

async function writeSchemaFile(name: string, sdl: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'hive-gateway-dev-fetcher-'));
  tempDirs.push(cwd);
  await writeFile(join(cwd, name), sdl, 'utf8');
  return cwd;
}

afterAll(() =>
  Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  ),
);

const log = new Logger({ level: process.env['DEBUG'] ? 'debug' : false });

function unexpectedFetch(): never {
  throw new Error('Unexpected fetch call');
}

/** Fetchers created during a test; each one's circuit breaker is shut down in `afterEach`. */
const fetchers: DevFetcher[] = [];

function createTestFetcher(
  devOpts: Omit<GatewayHiveDevOptions, 'type'>,
  configContext: Partial<GatewayConfigContext> = {},
) {
  const fetcher = createDevFetcher({
    devOpts: { type: 'dev', ...devOpts },
    configContext: {
      log,
      cwd: process.cwd(),
      fetch: unexpectedFetch,
      ...configContext,
    },
    version: '1.2.3',
  });
  fetchers.push(fetcher);
  return fetcher;
}

afterEach(() => {
  for (const fetcher of fetchers.splice(0)) {
    fetcher.dispose();
  }
});

/** Simulates a non-Node runtime (e.g. Cloudflare Workers), where `process` lacks `.versions.node`. */
async function withoutNodeRuntime(run: () => Promise<void>) {
  const originalVersions = process.versions;
  // @ts-expect-error - `versions` is not optional
  delete process.versions;
  try {
    await run();
  } finally {
    // @ts-expect-error - `versions` is read-only
    process.versions = originalVersions;
  }
}

const federationSdl = 'type Query { hello: String }';
const registry = 'http://registry.localhost';

const remoteDevOpts = {
  services: [{ name: 'a', url: 'http://a' }],
  remote: true,
  registry,
  token: 'secret-token',
};

function federationIntrospectionResponse(sdl = federationSdl) {
  return jsonResponse({ data: { _service: { sdl } } });
}

function schemaComposeSuccessResponse(supergraphSdl = 'remote supergraph sdl') {
  return jsonResponse({
    data: {
      schemaCompose: {
        __typename: 'SchemaComposeSuccess',
        valid: true,
        compositionResult: { supergraphSdl },
      },
    },
  });
}

/** Answers federation introspection for every service url and `compose` for the registry. */
function remoteFetch(
  compose: () => Response,
  sdl: () => string = () => federationSdl,
  registryUrl = registry,
) {
  return vi.fn(async (url: string, _init?: RequestInit) =>
    url === registryUrl ? compose() : federationIntrospectionResponse(sdl()),
  );
}

function registryCalls(fetch: {
  mock: { calls: readonly (readonly unknown[])[] };
}) {
  return fetch.mock.calls.filter(([url]) => url === registry);
}

const graphqlIntrospectionResult = (fieldName: string) => ({
  __schema: {
    queryType: { name: 'Query' },
    mutationType: null,
    subscriptionType: null,
    types: [
      {
        kind: 'OBJECT',
        name: 'Query',
        fields: [
          {
            name: fieldName,
            args: [],
            type: { kind: 'SCALAR', name: 'String', ofType: null },
            isDeprecated: false,
          },
        ],
        interfaces: [],
      },
      { kind: 'SCALAR', name: 'String' },
    ],
    directives: [],
  },
});

describe('Hive dev fetcher', () => {
  it('throws a LocalSupergraphCompositionError carrying the composition errors when local composition fails', async () => {
    const fetch = vi.fn(async (url: string) =>
      federationIntrospectionResponse(
        url === 'http://a'
          ? 'type Query { hello: String }'
          : 'type Query { hello: Int }',
      ),
    );
    const fetcher = createTestFetcher(
      {
        services: [
          { name: 'a', url: 'http://a' },
          { name: 'b', url: 'http://b' },
        ],
      },
      { fetch },
    );

    const error = await fetcher.fetch().catch((e) => e);

    expect(error).toBeInstanceOf(LocalSupergraphCompositionError);
    expect(error.compositionResult.errors.length).toBeGreaterThan(0);
    expect(error.message).toMatch(/^Local composition failed:\n.+/);
  });

  it('composes remotely with the registry request built from the options', async () => {
    const fetch = remoteFetch(() => schemaComposeSuccessResponse());
    const fetcher = createTestFetcher(
      {
        ...remoteDevOpts,
        target: { byId: 'target-id' },
        unstable__forceLatest: true,
      },
      { fetch },
    );

    await expect(fetcher.fetch()).resolves.toBe('remote supergraph sdl');

    expect(fetch).toHaveBeenCalledWith(
      registry,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          authorization: 'Bearer secret-token',
          'graphql-client-name': 'Hive Dev Fetcher',
          'graphql-client-version': '1.2.3',
        }),
      }),
    );
    const body = sentBody(fetch.mock.calls[1]![1]);
    expect(body.query).toContain('mutation CreateDevFetcher_SchemaCompose');
    expect(body.variables).toEqual({
      input: {
        useLatestComposableVersion: false,
        services: [{ name: 'a', url: 'http://a', sdl: federationSdl }],
        target: { byId: 'target-id' },
      },
    });
  });

  it('throws a SupergraphRegistryApiError when the registry returns a SchemaComposeError', async () => {
    const fetcher = createTestFetcher(remoteDevOpts, {
      fetch: remoteFetch(() =>
        jsonResponse({
          data: {
            schemaCompose: {
              __typename: 'SchemaComposeError',
              message: 'something went wrong',
            },
          },
        }),
      ),
    });

    await expect(fetcher.fetch()).rejects.toThrow(SupergraphRegistryApiError);
  });

  it('throws a RemoteSupergraphCompositionError when remote composition is invalid with errors', async () => {
    const fetcher = createTestFetcher(remoteDevOpts, {
      fetch: remoteFetch(() =>
        jsonResponse({
          data: {
            schemaCompose: {
              __typename: 'SchemaComposeSuccess',
              valid: false,
              compositionResult: {
                supergraphSdl: null,
                errors: { edges: [{ node: { message: 'field conflict' } }] },
              },
            },
          },
        }),
      ),
    });

    const error = await fetcher.fetch().catch((e) => e);

    expect(error).toBeInstanceOf(RemoteSupergraphCompositionError);
    expect(error.errors).toEqual([{ message: 'field conflict' }]);
    expect(error.message).toBe('Remote composition failed:\nfield conflict');
  });

  it('throws an InvalidSupergraphResultError when composition is valid but has no supergraph SDL', async () => {
    const fetcher = createTestFetcher(remoteDevOpts, {
      fetch: remoteFetch(() =>
        jsonResponse({
          data: {
            schemaCompose: {
              __typename: 'SchemaComposeSuccess',
              valid: true,
              compositionResult: { supergraphSdl: null },
            },
          },
        }),
      ),
    });

    await expect(fetcher.fetch()).rejects.toThrow(InvalidSupergraphResultError);
  });

  it('rejects when a service responds with a non-OK status', async () => {
    const fetch = vi.fn(async () => jsonResponse({}, { status: 500 }));

    const fetcher = createTestFetcher(
      { services: [{ name: 'a', url: 'http://a' }] },
      { fetch },
    );

    await expect(fetcher.fetch()).rejects.toThrow(
      'POST http://a failed with status 500.',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not recompose when resolved service SDLs are unchanged', async () => {
    const fetch = remoteFetch(() => schemaComposeSuccessResponse());
    const fetcher = createTestFetcher(remoteDevOpts, {
      fetch,
      cache: createMemoryCache(),
    });

    await fetcher.fetch();
    await fetcher.fetch();

    // one introspection call per `fetch()`, but composition only runs once (cached on the 2nd).
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(registryCalls(fetch)).toHaveLength(1);
  });

  it('recomposes when a resolved service SDL changes', async () => {
    let sdl = federationSdl;
    const fetch = remoteFetch(
      () => schemaComposeSuccessResponse(`composed from: ${sdl}`),
      () => sdl,
    );
    const fetcher = createTestFetcher(remoteDevOpts, {
      fetch,
      cache: createMemoryCache(),
    });

    const first = await fetcher.fetch();
    sdl = 'type Query { hello: Int }';
    const second = await fetcher.fetch();

    expect(first).not.toBe(second);
    expect(registryCalls(fetch)).toHaveLength(2);
  });

  it('recomposes when a service URL changes even though its SDL is unchanged', async () => {
    const fetch = remoteFetch(() => schemaComposeSuccessResponse());
    const services = [{ name: 'a', url: 'http://a' }];
    const fetcher = createTestFetcher(
      { ...remoteDevOpts, services },
      { fetch, cache: createMemoryCache() },
    );

    await fetcher.fetch();
    services[0]!.url = 'http://a-moved';
    await fetcher.fetch();

    // same SDL from both URLs, but the supergraph routes to the URL, so it must be recomposed.
    expect(registryCalls(fetch)).toHaveLength(2);
  });

  it('always composes on boot, even when the cache holds an entry for unchanged services', async () => {
    const fetch = remoteFetch(() => schemaComposeSuccessResponse());
    // shared across fetchers, simulating a cache that outlives the process (e.g. Redis)
    const cache = createMemoryCache();

    await createTestFetcher(remoteDevOpts, { fetch, cache }).fetch();
    await createTestFetcher(remoteDevOpts, { fetch, cache }).fetch();

    // the persisted entry may stem from a different configuration or an outdated target,
    // so a freshly booted fetcher must not reuse it.
    expect(registryCalls(fetch)).toHaveLength(2);
  });

  it('does not trust the cache until this process has composed successfully once', async () => {
    const cache = createMemoryCache();
    await createTestFetcher(remoteDevOpts, {
      fetch: remoteFetch(() => schemaComposeSuccessResponse('stale')),
      cache,
    }).fetch();

    let registryFailures = 1;
    const fetch = remoteFetch(() =>
      registryFailures-- > 0
        ? jsonResponse({
            data: {
              schemaCompose: {
                __typename: 'SchemaComposeError',
                message: 'composition unavailable',
              },
            },
          })
        : schemaComposeSuccessResponse('fresh'),
    );
    const fetcher = createTestFetcher(remoteDevOpts, { fetch, cache });

    await expect(fetcher.fetch()).rejects.toThrow(SupergraphRegistryApiError);
    await expect(fetcher.fetch()).resolves.toBe('fresh');
    expect(registryCalls(fetch)).toHaveLength(2);
  });

  it('composes against the Hive Cloud registry when `registry` is omitted', async () => {
    const fetch = remoteFetch(
      () => schemaComposeSuccessResponse(),
      undefined,
      DEFAULT_HIVE_REGISTRY_ENDPOINT,
    );
    const fetcher = createTestFetcher(
      { ...remoteDevOpts, registry: undefined },
      { fetch },
    );

    await expect(fetcher.fetch()).resolves.toBe('remote supergraph sdl');

    expect(fetch).toHaveBeenCalledWith(
      'https://app.graphql-hive.com/graphql',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when `remote` is enabled without a token', async () => {
    const fetcher = createTestFetcher({ services: [], remote: true, registry });

    await expect(fetcher.fetch()).rejects.toThrow(
      '`token` is required when `remote` is enabled.',
    );
  });

  it('does not reference `process` when no file-based service is configured outside Node.js', () =>
    withoutNodeRuntime(async () => {
      const fetch = vi.fn(async () => federationIntrospectionResponse());
      const fetcher = createTestFetcher(
        { services: [{ name: 'a', url: 'http://a' }] },
        { fetch },
      );

      await expect(fetcher.fetch()).resolves.toContain('hello');
    }));

  it('throws a clear error when a file-based service is used outside Node.js', () =>
    withoutNodeRuntime(async () => {
      const fetcher = createTestFetcher({
        services: [
          { name: 'a', url: 'http://a', source: 'file', schema: 'a.graphql' },
        ],
      });

      await expect(fetcher.fetch()).rejects.toThrow(
        /requires Node\.js and is not supported in this runtime/,
      );
    }));

  it('does not fall back to standard introspection when federation introspection fails', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        errors: [{ message: 'Cannot query field "_service" on type "Query".' }],
      }),
    );
    const fetcher = createTestFetcher(
      { services: [{ name: 'a', url: 'http://a' }] },
      { fetch },
    );

    await expect(fetcher.fetch()).rejects.toThrow(/federation introspection/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit breaker after repeated composition failures, preventing further composition attempts', async () => {
    const fetch = remoteFetch(() =>
      jsonResponse({
        data: {
          schemaCompose: {
            __typename: 'SchemaComposeError',
            message: 'composition unavailable',
          },
        },
      }),
    );
    const fetcher = createTestFetcher(
      {
        ...remoteDevOpts,
        circuitBreaker: {
          volumeThreshold: 1,
          errorThresholdPercentage: 1,
          resetTimeout: 30_000,
        },
      },
      { fetch },
    );

    await expect(fetcher.fetch()).rejects.toThrow(SupergraphRegistryApiError);
    expect(registryCalls(fetch)).toHaveLength(1);

    // The breaker is now open: composition is not attempted again until `resetTimeout` elapses.
    await expect(fetcher.fetch()).rejects.toThrow('Breaker is open');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(registryCalls(fetch)).toHaveLength(1);
  });

  it('dispose() shuts down the circuit breaker, so `fetch` can no longer compose', async () => {
    const fetcher = createTestFetcher(
      { services: [{ name: 'a', url: 'http://a' }] },
      { fetch: vi.fn(async () => federationIntrospectionResponse()) },
    );

    fetcher.dispose();

    await expect(fetcher.fetch()).rejects.toThrow('shutdown');
  });

  it('resolves each service with its own source', async () => {
    const cwd = await writeSchemaFile(
      'a.graphql',
      'type Query { fileField: String }',
    );
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      url === 'http://c'
        ? jsonResponse({ data: graphqlIntrospectionResult('graphqlField') })
        : federationIntrospectionResponse(
            'type Query { federationField: String }',
          ),
    );
    const fetcher = createTestFetcher(
      {
        services: [
          { name: 'a', url: 'http://a', source: 'file', schema: 'a.graphql' },
          { name: 'b', url: 'http://b' },
          { name: 'c', url: 'http://c', source: 'graphql' },
        ],
      },
      { cwd, fetch },
    );

    const supergraphSdl = await fetcher.fetch();

    expect(supergraphSdl).toContain('fileField');
    expect(supergraphSdl).toContain('federationField');
    expect(supergraphSdl).toContain('graphqlField');
    expect(fetch).toHaveBeenCalledTimes(2);
    const queryByUrl = new Map(
      fetch.mock.calls.map(([url, init]) => [url, sentBody(init).query]),
    );
    expect(queryByUrl.get('http://b')).toContain('_service');
    expect(queryByUrl.get('http://c')).toContain('__schema');
  });
});
