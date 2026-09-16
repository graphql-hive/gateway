import type { CircuitBreakerConfiguration } from '@graphql-hive/core';
import type { MeshFetch } from '@graphql-mesh/types';
import {
  composeServices,
  compositionHasErrors,
  type CompositionFailure,
  type CompositionResult,
} from '@theguild/federation-composition';
import {
  buildClientSchema,
  getIntrospectionQuery,
  parse,
  printSchema,
  type IntrospectionQuery,
} from 'graphql';
import CircuitBreaker from 'opossum';
import type {
  DevFetcherTargetReference,
  GatewayConfigContext,
  GatewayHiveDevOptions,
  HiveDevService,
} from '../types';

type Service = {
  name: string;
  url: string;
  sdl: string;
};

type CachedSupergraph = {
  services: Service[];
  supergraphSdl: string;
};

export interface CreateDevFetcherOpts {
  devOpts: GatewayHiveDevOptions;
  configContext: GatewayConfigContext;
  /** Reported to the registry API when composing remotely. */
  version?: string;
}

export interface DevFetcher {
  /** Resolve the configured services and return the (possibly cached) composed supergraph SDL. */
  fetch(): Promise<string>;
  /** Dispose the fetcher and clean up the circuit breaker's timers. */
  dispose(): void;
}

const defaultCircuitBreakerConfiguration: CircuitBreakerConfiguration = {
  errorThresholdPercentage: 50,
  volumeThreshold: 10,
  resetTimeout: 30_000,
};

const CACHE_KEY = 'hive:dev-fetcher:supergraph';

/** The Hive Cloud registry GraphQL API endpoint, used when `registry` is not configured. */
export const DEFAULT_HIVE_REGISTRY_ENDPOINT =
  'https://app.graphql-hive.com/graphql';

export class LocalSupergraphCompositionError extends Error {
  constructor(public compositionResult: CompositionFailure) {
    super(
      `Local composition failed:\n${compositionResult.errors
        .map((error) => error.message)
        .join('\n')}`,
    );
    this.name = 'LocalSupergraphCompositionError';
  }
}

/** The registry API returned a GraphQL/API-level error while composing remotely. */
export class SupergraphRegistryApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupergraphRegistryApiError';
  }
}

/** Remote composition finished but produced composition errors. */
export class RemoteSupergraphCompositionError extends Error {
  constructor(public errors: Array<{ message: string }>) {
    super(
      `Remote composition failed:\n${errors.map((error) => error.message).join('\n')}`,
    );
    this.name = 'RemoteSupergraphCompositionError';
  }
}

/** Remote composition reported success but did not return a usable supergraph SDL. */
export class InvalidSupergraphResultError extends Error {
  constructor(public supergraphSdl: string | null | undefined) {
    super(
      `Remote composition resulted in an invalid supergraph: ${supergraphSdl}`,
    );
    this.name = 'InvalidSupergraphResultError';
  }
}

async function postJson<TBody>(
  fetch: MeshFetch,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<TBody> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`POST ${url} failed with status ${response.status}.`);
  }

  return response.json();
}

async function composeSupergraphLocally(services: Service[]): Promise<string> {
  const compositionResult = await new Promise<CompositionResult>(
    (resolvePromise, reject) => {
      try {
        resolvePromise(
          composeServices(
            services.map((service) => ({
              name: service.name,
              url: service.url,
              typeDefs: parse(service.sdl),
            })),
          ),
        );
      } catch (error) {
        // composeServices should not throw; this reject covers the offchance that
        // something unexpected happens under the hood, so the promise doesn't hang.
        reject(error);
      }
    },
  );

  if (compositionHasErrors(compositionResult)) {
    throw new LocalSupergraphCompositionError(compositionResult);
  }

  return compositionResult.supergraphSdl;
}

async function composeSupergraphRemotely(input: {
  services: Service[];
  registry: string;
  token: string;
  unstable__forceLatest: boolean;
  target: DevFetcherTargetReference | null;
  version: string;
  fetch: MeshFetch;
}): Promise<string> {
  const body = await postJson<{
    data?: {
      schemaCompose:
        | {
            __typename: 'SchemaComposeSuccess';
            valid: boolean;
            compositionResult: {
              supergraphSdl?: string | null;
              errors?: { edges: Array<{ node: { message: string } }> } | null;
            };
          }
        | { __typename: 'SchemaComposeError'; message: string };
    };
    errors?: Array<{ message: string }>;
  }>(
    input.fetch,
    input.registry,
    {
      query: /* GraphQL */ `
        mutation CreateDevFetcher_SchemaCompose($input: SchemaComposeInput!) {
          schemaCompose(input: $input) {
            __typename
            ... on SchemaComposeSuccess {
              valid
              compositionResult {
                supergraphSdl
                errors {
                  edges {
                    node {
                      message
                    }
                  }
                }
              }
            }
            ... on SchemaComposeError {
              message
            }
          }
        }
      `,
      variables: {
        input: {
          useLatestComposableVersion: !input.unstable__forceLatest,
          services: input.services.map((service) => ({
            name: service.name,
            url: service.url,
            sdl: service.sdl,
          })),
          target: input.target,
        },
      },
    },
    {
      authorization: `Bearer ${input.token}`,
      'graphql-client-name': 'Hive Dev Fetcher',
      'graphql-client-version': input.version,
    },
  );

  if (body.errors?.length) {
    throw new SupergraphRegistryApiError(
      body.errors.map((error) => error.message).join(', '),
    );
  }

  const schemaCompose = body.data?.schemaCompose;
  if (!schemaCompose) {
    throw new SupergraphRegistryApiError(
      'Received an unexpected response from the registry.',
    );
  }

  if (schemaCompose.__typename === 'SchemaComposeError') {
    throw new SupergraphRegistryApiError(schemaCompose.message);
  }

  const { valid, compositionResult } = schemaCompose;

  if (!valid) {
    if (compositionResult.errors) {
      throw new RemoteSupergraphCompositionError(
        compositionResult.errors.edges.map((edge) => edge.node),
      );
    }

    throw new InvalidSupergraphResultError(compositionResult.supergraphSdl);
  }

  if (typeof compositionResult.supergraphSdl !== 'string') {
    throw new InvalidSupergraphResultError(compositionResult.supergraphSdl);
  }

  return compositionResult.supergraphSdl;
}

async function introspectFederationService(
  service: HiveDevService,
  fetch: MeshFetch,
): Promise<string> {
  const body = await postJson<{
    data?: { _service?: { sdl?: string } };
    errors?: Array<{ message: string }>;
  }>(fetch, service.url, { query: '{ _service { sdl } }' });

  if (body.errors?.length || !body.data?._service?.sdl) {
    throw new Error(
      `Could not get a federation introspection result from the service "${service.name}". ` +
        `Make sure the service exposes a federation "_service { sdl }" field, or set its ` +
        `"source" option to "graphql" to use standard GraphQL introspection instead.`,
    );
  }

  return body.data._service.sdl;
}

async function introspectGraphQLService(
  service: HiveDevService,
  fetch: MeshFetch,
): Promise<string> {
  const body = await postJson<{
    data?: IntrospectionQuery;
    errors?: Array<{ message: string }>;
  }>(fetch, service.url, { query: getIntrospectionQuery() });

  if (body.errors?.length || !body.data) {
    throw new Error(
      `Could not get introspection result from the service "${service.name}". Make sure introspection is enabled by the server.`,
    );
  }

  return printSchema(buildClientSchema(body.data));
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' && typeof process.versions?.node === 'string'
  );
}

async function readLocalSchemaFile(
  cwd: string,
  schema: string,
): Promise<string> {
  if (!isNodeRuntime()) {
    throw new Error(
      `Cannot resolve the "${schema}" schema from a local file: "source: 'file'" requires ` +
        `Node.js and is not supported in this runtime.`,
    );
  }

  // The specifiers are held in variables (not passed as literals) so bundlers targeting
  // non-Node runtimes (e.g. Cloudflare Workers) don't try to statically resolve these
  // Node built-ins for consumers who never use the `source: 'file'` service option.
  const fsPromisesSpecifier = 'fs/promises';
  const pathSpecifier = 'path';
  const { readFile } = await import(fsPromisesSpecifier);
  const { resolve: resolvePath } = await import(pathSpecifier);

  return readFile(resolvePath(cwd, schema), 'utf8');
}

async function resolveService(
  service: HiveDevService,
  cwd: string,
  fetch: MeshFetch,
): Promise<Service> {
  if (service.source === 'file') {
    const contents = await readLocalSchemaFile(cwd, service.schema);
    // validates the SDL early; the raw contents are what gets composed
    parse(contents);
    return { name: service.name, url: service.url, sdl: contents };
  }

  const sdl =
    service.source === 'graphql'
      ? await introspectGraphQLService(service, fetch)
      : await introspectFederationService(service, fetch);

  return { name: service.name, url: service.url, sdl };
}

function resolveServices(
  services: HiveDevService[],
  cwd: string,
  fetch: MeshFetch,
): Promise<Service[]> {
  return Promise.all(
    services.map((service) => resolveService(service, cwd, fetch)),
  );
}

function servicesUnchanged(previous: Service[], next: Service[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  return next.every(
    (service) =>
      previous.find((p) => p.name === service.name)?.sdl === service.sdl,
  );
}

/**
 * Create a fetcher that can get subgraph definitions from a local file, graphql introspection,
 * or federated introspection (default), and then compose these services either locally or
 * remotely through the Hive registry, where they replace the target's latest services by name.
 *
 * This is an alternative to running `@graphql-hive/cli`'s `dev` command next to the gateway.
 *
 * The composed supergraph is cached and only recomposed when the resolved service SDLs change,
 * but introspection and file reading run on every call, so set the gateway's polling interval
 * accordingly. Composition is guarded by a circuit breaker so the expensive composition request
 * is guaranteed not to run too frequently.
 */
export function createDevFetcher({
  devOpts,
  configContext,
  version = 'unknown',
}: CreateDevFetcherOpts): DevFetcher {
  const { fetch, log, cwd, cache } = configContext;
  const circuitBreakerConfig =
    devOpts.circuitBreaker ?? defaultCircuitBreakerConfiguration;

  const composeBreaker = new CircuitBreaker(
    async (services: Service[]) => {
      if (devOpts.remote) {
        if (!devOpts.token) {
          throw new Error('`token` is required when `remote` is enabled.');
        }

        log.debug('Composing supergraph remotely via the Hive registry');
        return composeSupergraphRemotely({
          services,
          registry: devOpts.registry ?? DEFAULT_HIVE_REGISTRY_ENDPOINT,
          token: devOpts.token,
          unstable__forceLatest: devOpts.unstable__forceLatest ?? false,
          target: devOpts.target ?? null,
          version,
          fetch,
        });
      }

      log.debug('Composing supergraph locally');
      return composeSupergraphLocally(services);
    },
    {
      ...circuitBreakerConfig,
      timeout: false,
    },
  );

  return {
    async fetch() {
      const services = await resolveServices(devOpts.services, cwd, fetch);

      const cached: CachedSupergraph | undefined = await cache?.get(CACHE_KEY);
      if (cached && servicesUnchanged(cached.services, services)) {
        log.debug(
          'Service SDLs are unchanged, reusing the composed supergraph',
        );
        return cached.supergraphSdl;
      }

      const supergraphSdl = await composeBreaker.fire(services);

      await cache?.set(CACHE_KEY, { services, supergraphSdl });

      return supergraphSdl;
    },
    dispose() {
      composeBreaker.shutdown();
    },
  };
}
