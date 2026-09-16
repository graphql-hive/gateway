import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@graphql-hive/logger';
import type { KeyValueCache } from '@graphql-mesh/types';
import { describe, expect, it, vi } from 'vitest';
import {
  composeSupergraphLocally,
  composeSupergraphRemotely,
  createDevFetcher,
  InvalidSupergraphResultError,
  LocalSupergraphCompositionError,
  RemoteSupergraphCompositionError,
  SupergraphRegistryApiError,
} from '../src/fetchers/dev';
import type { GatewayConfigContext, GatewayHiveDevOptions } from '../src/types';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
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

async function writeSchemaFile(name: string, sdl: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'hive-gateway-dev-fetcher-'));
  await writeFile(join(cwd, name), sdl, 'utf8');
  return cwd;
}

const log = new Logger({ level: process.env['DEBUG'] ? 'debug' : false });

function unexpectedFetch(): never {
  throw new Error('Unexpected fetch call');
}

function createTestFetcher(
  devOpts: Omit<GatewayHiveDevOptions, 'type'>,
  configContext: Partial<GatewayConfigContext> = {},
) {
  return createDevFetcher({
    devOpts: { type: 'dev', ...devOpts },
    configContext: {
      log,
      cwd: process.cwd(),
      fetch: unexpectedFetch,
      ...configContext,
    },
    version: '1.2.3',
  });
}

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
  it('composes a valid supergraph from local services', async () => {
    const supergraphSdl = await composeSupergraphLocally([
      { name: 'a', url: 'http://a', sdl: federationSdl },
    ]);

    expect(supergraphSdl).toContain('hello');
  });

  it('throws a LocalSupergraphCompositionError carrying the composition errors when local composition fails', async () => {
    const error = await composeSupergraphLocally([
      { name: 'a', url: 'http://a', sdl: 'type Query { hello: String }' },
      { name: 'b', url: 'http://b', sdl: 'type Query { hello: Int }' },
    ]).catch((e) => e);

    expect(error).toBeInstanceOf(LocalSupergraphCompositionError);
    expect(error.compositionResult.errors.length).toBeGreaterThan(0);
    expect(error.message).toBe(
      `Local composition failed:\n${error.compositionResult.errors
        .map((e: Error) => e.message)
        .join('\n')}`,
    );
  });

  const remoteComposeArgs = {
    services: [{ name: 'a', url: 'http://a', sdl: federationSdl }],
    registry,
    token: 'secret-token',
    unstable__forceLatest: false,
    target: null,
    version: '1.2.3',
  };

  it('composes remotely and returns the supergraph SDL', async () => {
    const fetch = vi.fn().mockResolvedValue(schemaComposeSuccessResponse());

    const result = await composeSupergraphRemotely({
      ...remoteComposeArgs,
      fetch,
    });

    expect(result).toBe('remote supergraph sdl');
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
    const [, init] = fetch.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.query).toContain('mutation CreateDevFetcher_SchemaCompose');
    expect(body.variables).toEqual({
      input: {
        useLatestComposableVersion: true,
        services: [{ name: 'a', url: 'http://a', sdl: federationSdl }],
        target: null,
      },
    });
  });

  it('throws a SupergraphRegistryApiError when the registry returns a SchemaComposeError', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          schemaCompose: {
            __typename: 'SchemaComposeError',
            message: 'something went wrong',
          },
        },
      }),
    );

    await expect(
      composeSupergraphRemotely({ ...remoteComposeArgs, fetch }),
    ).rejects.toThrow(SupergraphRegistryApiError);
  });

  it('throws a RemoteSupergraphCompositionError when remote composition is invalid with errors', async () => {
    const fetch = vi.fn().mockResolvedValue(
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
    );

    const error = await composeSupergraphRemotely({
      ...remoteComposeArgs,
      fetch,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(RemoteSupergraphCompositionError);
    expect(error.errors).toEqual([{ message: 'field conflict' }]);
    expect(error.message).toBe('Remote composition failed:\nfield conflict');
  });

  it('throws an InvalidSupergraphResultError when composition is valid but has no supergraph SDL', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          schemaCompose: {
            __typename: 'SchemaComposeSuccess',
            valid: true,
            compositionResult: { supergraphSdl: null },
          },
        },
      }),
    );

    await expect(
      composeSupergraphRemotely({ ...remoteComposeArgs, fetch }),
    ).rejects.toThrow(InvalidSupergraphResultError);
  });

  it('rejects when a service responds with a non-OK status', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 }));

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
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url === registry
          ? schemaComposeSuccessResponse()
          : federationIntrospectionResponse(),
      );

    const fetcher = createTestFetcher(
      {
        services: [{ name: 'a', url: 'http://a' }],
        remote: true,
        registry,
        token: 'secret-token',
      },
      { fetch, cache: createMemoryCache() },
    );

    const first = await fetcher.fetch();
    const second = await fetcher.fetch();

    expect(first).toBe(second);
    // one introspection call per `fetch()`, but composition only runs once (cached on the 2nd).
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.filter(([url]) => url === registry)).toHaveLength(
      1,
    );
  });

  it('recomposes when a resolved service SDL changes', async () => {
    let sdl = federationSdl;
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url === registry
          ? schemaComposeSuccessResponse(`composed from: ${sdl}`)
          : federationIntrospectionResponse(sdl),
      );

    const fetcher = createTestFetcher(
      {
        services: [{ name: 'a', url: 'http://a' }],
        remote: true,
        registry,
        token: 'secret-token',
      },
      { fetch, cache: createMemoryCache() },
    );

    const first = await fetcher.fetch();
    sdl = 'type Query { hello: Int }';
    const second = await fetcher.fetch();

    expect(first).not.toBe(second);
    expect(fetch.mock.calls.filter(([url]) => url === registry)).toHaveLength(
      2,
    );
  });

  it('composes remotely when `remote` is enabled', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url === 'http://a'
          ? federationIntrospectionResponse()
          : schemaComposeSuccessResponse(),
      );

    const fetcher = createTestFetcher(
      {
        services: [{ name: 'a', url: 'http://a' }],
        remote: true,
        registry,
        token: 'secret-token',
        unstable__forceLatest: true,
      },
      { fetch },
    );

    const result = await fetcher.fetch();

    expect(result).toBe('remote supergraph sdl');
    const [, init] = fetch.mock.calls[1]!;
    expect(
      JSON.parse(init.body as string).variables.input
        .useLatestComposableVersion,
    ).toBe(false);
  });

  it('throws when `remote` is enabled without a registry or token', async () => {
    const fetcher = createTestFetcher({ services: [], remote: true });

    await expect(fetcher.fetch()).rejects.toThrow(
      '`registry` and `token` are required when `remote` is enabled.',
    );
  });

  it('resolves a relative schema file path against `cwd`', async () => {
    const cwd = await writeSchemaFile('a.graphql', federationSdl);

    const fetcher = createTestFetcher(
      {
        services: [
          { name: 'a', url: 'http://a', source: 'file', schema: 'a.graphql' },
        ],
      },
      { cwd },
    );

    const supergraphSdl = await fetcher.fetch();

    expect(supergraphSdl).toContain('hello');
  });

  it('does not reference `process` when no file-based service is configured outside Node.js', () =>
    withoutNodeRuntime(async () => {
      const fetch = vi
        .fn()
        .mockImplementation(async () => federationIntrospectionResponse());

      const fetcher = createTestFetcher(
        { services: [{ name: 'a', url: 'http://a' }] },
        { fetch },
      );
      const supergraphSdl = await fetcher.fetch();

      expect(supergraphSdl).toContain('hello');
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

  it('uses federation introspection (`_service { sdl }`) by default', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => federationIntrospectionResponse());

    const fetcher = createTestFetcher(
      { services: [{ name: 'a', url: 'http://a' }] },
      { fetch },
    );
    const supergraphSdl = await fetcher.fetch();

    expect(supergraphSdl).toContain('hello');
    const [, init] = fetch.mock.calls[0]!;
    expect(JSON.parse(init.body as string).query).toContain('_service');
  });

  it('uses standard GraphQL introspection when `source: "graphql"` is set', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse({ data: graphqlIntrospectionResult('hello') }),
      );

    const fetcher = createTestFetcher(
      { services: [{ name: 'a', url: 'http://a', source: 'graphql' }] },
      { fetch },
    );

    const supergraphSdl = await fetcher.fetch();

    expect(supergraphSdl).toContain('hello');
    const [, init] = fetch.mock.calls[0]!;
    expect(JSON.parse(init.body as string).query).toContain('__schema');
  });

  it('does not fall back to standard introspection when federation introspection fails', async () => {
    const fetch = vi.fn().mockResolvedValue(
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
    let introspectionCalls = 0;
    let composeCalls = 0;
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'http://a') {
        introspectionCalls++;
        return federationIntrospectionResponse();
      }

      composeCalls++;
      return jsonResponse({
        data: {
          schemaCompose: {
            __typename: 'SchemaComposeError',
            message: 'composition unavailable',
          },
        },
      });
    });

    const fetcher = createTestFetcher(
      {
        services: [{ name: 'a', url: 'http://a' }],
        remote: true,
        registry,
        token: 'secret-token',
        circuitBreaker: {
          volumeThreshold: 1,
          errorThresholdPercentage: 1,
          resetTimeout: 30_000,
        },
      },
      { fetch },
    );

    try {
      await expect(fetcher.fetch()).rejects.toThrow(SupergraphRegistryApiError);
      expect(composeCalls).toBe(1);

      // The breaker is now open: composition is not attempted again until `resetTimeout` elapses.
      await expect(fetcher.fetch()).rejects.toThrow('Breaker is open');
      expect(introspectionCalls).toBe(2);
      expect(composeCalls).toBe(1);
    } finally {
      fetcher.dispose();
    }
  });

  it('dispose() shuts down the circuit breaker, so `fetch` can no longer compose', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => federationIntrospectionResponse());

    const fetcher = createTestFetcher(
      { services: [{ name: 'a', url: 'http://a' }] },
      { fetch },
    );

    fetcher.dispose();

    await expect(fetcher.fetch()).rejects.toThrow('shutdown');
  });

  it('resolves each service with its own source', async () => {
    const cwd = await writeSchemaFile(
      'a.graphql',
      'type Query { fileField: String }',
    );

    const fetch = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        const { query } = JSON.parse(init.body as string);

        if (url === 'http://b') {
          expect(query).toContain('_service');
          return federationIntrospectionResponse(
            'type Query { federationField: String }',
          );
        }

        expect(url).toBe('http://c');
        expect(query).toContain('__schema');
        return jsonResponse({
          data: graphqlIntrospectionResult('graphqlField'),
        });
      });

    const fetcher = createTestFetcher(
      {
        services: [
          { name: 'a', url: 'http://a', source: 'file', schema: 'a.graphql' },
          { name: 'b', url: 'http://b', source: 'federation' },
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
  });
});
