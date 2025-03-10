import { ApolloGateway, LocalGraphQLDataSource } from '@apollo/gateway';
import { createDefaultExecutor } from '@graphql-tools/delegate';
import { normalizedExecutor } from '@graphql-tools/executor';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import {
  accounts,
  createExampleSetup,
  createTenv,
  inventory,
  products,
  reviews,
} from '@internal/e2e';
import { benchConfig } from '@internal/testing';
import { fakePromise, handleMaybePromise } from '@whatwg-node/promise-helpers';
import { getOperationAST, GraphQLSchema, parse } from 'graphql';
import { bench, describe, expect, vi } from 'vitest';
import monolith from './monolith';

function memoize1<T extends (...args: any) => any>(fn: T): T {
  const memoize1cache = new Map();
  return function memoized(a1: Parameters<T>[0]): ReturnType<T> {
    const cachedValue = memoize1cache.get(a1);
    if (cachedValue === undefined) {
      const newValue = fn(a1);
      memoize1cache.set(a1, newValue);
      return newValue;
    }

    return cachedValue;
  } as T;
}

describe('Federation', async () => {
  const { fs } = createTenv(__dirname);
  const { query, operationName, result, supergraph } =
    createExampleSetup(__dirname);
  const services: Record<string, { schema: GraphQLSchema }> = {
    accounts,
    inventory,
    products,
    reviews,
  };
  const memoizedParse = memoize1(parse);

  // Only if you want to see the latency that the gateway adds
  bench.skip(
    'Monolith',
    () =>
      normalizedExecutor({
        schema: monolith,
        document: memoizedParse(query),
        operationName: operationName,
        contextValue: {},
      }) as Promise<void>,
  );

  const supergraphPath = await supergraph();
  const supergraphSdl = await fs.read(supergraphPath);
  type ApolloGWExecutorOpts = Parameters<ApolloGateway['executor']>[0];
  const dummyLogger: ApolloGWExecutorOpts['logger'] = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const dummyCache: ApolloGWExecutorOpts['cache'] = {
    get: () => fakePromise(undefined),
    set: () => fakePromise(undefined),
    delete: () => fakePromise(true),
  };
  const parsedQuery = parse(query, { noLocation: true });
  const operationAST = getOperationAST(parsedQuery, operationName);

  if (!operationAST) {
    throw new Error(`Operation ${operationName} not found`);
  }

  let apolloGW: ApolloGateway;
  let apolloGWSchema: GraphQLSchema;
  let apolloGWExecutor: ApolloGateway['executor'];

  const schemaHash: string & { __fauxpaque: 'SchemaHash' } = Object.assign(
    new String(supergraphSdl) as string,
    { __fauxpaque: 'SchemaHash' } as const,
  );

  bench(
    'Apollo Gateway',
    () => {
      return handleMaybePromise(
        () =>
          apolloGWExecutor({
            document: parsedQuery,
            operationName,
            request: {
              query: query,
            },
            operation: operationAST,
            metrics: {},
            overallCachePolicy: {},
            schemaHash,
            queryHash: query,
            source: query,
            cache: dummyCache,
            schema: apolloGWSchema,
            logger: dummyLogger,
            context: {},
          }),
        (response) => {
          expect(response).toEqual(result);
        },
      );
    },
    {
      async setup() {
        apolloGW = new ApolloGateway({
          logger: dummyLogger,
          supergraphSdl,
          buildService({ name }) {
            const lowercasedName = name.toLowerCase();
            const service = services[lowercasedName];
            if (!service) {
              throw new Error(`Service ${name} not found`);
            }
            return new LocalGraphQLDataSource(service.schema);
          },
        });
        const { schema, executor } = await apolloGW.load();
        apolloGWSchema = schema;
        apolloGWExecutor = executor;
      },
      teardown() {
        return apolloGW.stop();
      },
      ...benchConfig,
    },
  );

  let stitchedSchema: GraphQLSchema;

  bench(
    'Stitching',
    () =>
      handleMaybePromise(
        () =>
          normalizedExecutor({
            schema: stitchedSchema,
            document: parsedQuery,
            operationName: operationName,
            contextValue: {},
          }),
        (response) => {
          expect(response).toEqual(result);
        },
      ),
    {
      setup() {
        stitchedSchema = getStitchedSchemaFromSupergraphSdl({
          supergraphSdl,
          onSubschemaConfig(subschemaConfig) {
            const lowercasedName = subschemaConfig.name.toLowerCase();
            const service = services[lowercasedName];
            if (!service) {
              throw new Error(`Service ${subschemaConfig.name} not found`);
            }
            subschemaConfig.executor = createDefaultExecutor(service.schema);
          },
        });
      },
      ...benchConfig,
    },
  );
});
