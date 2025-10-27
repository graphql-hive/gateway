import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  GatewayConfigBase,
  GatewayConfigSupergraph,
  GatewayRuntime,
  UnifiedGraphConfig,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import type { ExecutionResult, MaybeAsyncIterable } from '@graphql-tools/utils';
import {
  GraphQLFieldResolver,
  GraphQLScalarType,
  parse,
  type GraphQLSchema,
} from 'graphql';
import {
  createYoga,
  DisposableSymbols,
  YogaServerOptions,
  type YogaServerInstance,
} from 'graphql-yoga';

/** Thanks @apollo/subgraph for not re-exporting this! */
export interface GraphQLResolverMap<TContext = {}> {
  [typeName: string]:
    | {
        [fieldName: string]:
          | GraphQLFieldResolver<any, TContext>
          | {
              requires?: string;
              resolve?: GraphQLFieldResolver<any, TContext>;
              subscribe?: GraphQLFieldResolver<any, TContext>;
            };
      }
    | GraphQLScalarType
    | {
        [enumValue: string]: string | number;
      };
}

export type GatewayTesterRemoteSchemaConfigYoga =
  | Exclude<YogaServerOptions<any, any>, 'schema'>
  | ((schema: GraphQLSchema) => YogaServerInstance<any, any>);

export interface GatewayTesterRemoteSchemaConfig {
  /** The name of the remote schema / subgraph / proxied server. */
  name: string;
  /** The remote schema. */
  schema: GraphQLSchema | { typeDefs: string; resolvers?: GraphQLResolverMap };
  /** The hostname of the remote schema. URL will become `http://${host}${yoga.graphqlEndpoint}`. */
  host?: string;
  /** An optional GraphQL Yoga server instance that runs the {@link schema built schema}. */
  yoga?: GatewayTesterRemoteSchemaConfigYoga;
}

export type GatewayTesterConfig<
  TContext extends Record<string, any> = Record<string, any>,
> =
  | ({
      // gateway
      supergraph: UnifiedGraphConfig;
    } & Omit<GatewayConfigSupergraph<TContext>, 'supergraph'>)
  | ({
      // gateway (composes subgraphs)
      subgraphs:
        | GatewayTesterRemoteSchemaConfig[]
        | (() => GatewayTesterRemoteSchemaConfig[]);
    } & Omit<GatewayConfigSupergraph<TContext>, 'supergraph'>)
  | ({
      // proxy
      proxy: GatewayTesterRemoteSchemaConfig;
    } & GatewayConfigBase<TContext>);
// TODO: subgraph mode

export interface GatewayTester<
  TContext extends Record<string, any> = Record<string, any>,
> extends AsyncDisposable {
  runtime: GatewayRuntime<TContext>;
  fetch: typeof fetch;
  execute(args: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
    extensions?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<MaybeAsyncIterable<ExecutionResult<any>>>;
  dispose(): Promise<void>;
}

export function createGatewayTester<
  TContext extends Record<string, any> = Record<string, any>,
>(config: GatewayTesterConfig<TContext>): GatewayTester<TContext> {
  let runtime: GatewayRuntime<TContext>;
  if ('supergraph' in config) {
    // use supergraph
    runtime = createGatewayRuntime({
      maskedErrors: false,
      logging: false,
      ...config,
    });
  } else if ('subgraphs' in config) {
    // compose subgraphs
    const subgraphsConfig = config.subgraphs;
    function buildSubgraphs() {
      subgraphsRef.ref = (
        typeof subgraphsConfig === 'function'
          ? subgraphsConfig()
          : subgraphsConfig
      ).reduce(
        (acc, subgraph) => {
          const remoteSchema = buildRemoteSchema(subgraph);
          return {
            ...acc,
            [remoteSchema.url]: remoteSchema,
          };
        },
        {} as Record<string, GatewayTesterRemoteSchema>,
      );
      return Object.values(subgraphsRef.ref);
    }
    const subgraphsRef = {
      ref: null as Record<string, GatewayTesterRemoteSchema> | null,
    };
    runtime = createGatewayRuntime({
      maskedErrors: false,
      logging: false,
      ...config,
      supergraph:
        typeof config.subgraphs === 'function'
          ? () => getUnifiedGraphGracefully(buildSubgraphs())
          : getUnifiedGraphGracefully(buildSubgraphs()),
      plugins: (ctx) => [
        useCustomFetch((url, options, context, info) => {
          const subgraph = subgraphsRef.ref?.[url];
          if (!subgraph) {
            throw new Error(`Subgraph for URL "${url}" not found or not ready`);
          }
          return subgraph.yoga!.fetch(
            // @ts-expect-error TODO: url can be a string, not only an instance of URL
            url,
            options,
            context,
            info,
          );
        }),
        ...(config.plugins?.(ctx) || []),
      ],
    });
  } else if ('proxy' in config) {
    // build remote schema and proxy
    const remoteSchema = buildRemoteSchema(config.proxy);
    runtime = createGatewayRuntime({
      maskedErrors: false,
      logging: false,
      ...config,
      proxy: { endpoint: remoteSchema.url },
      plugins: (ctx) => [
        useCustomFetch((url, options, context, info) => {
          return remoteSchema.yoga!.fetch(
            // @ts-expect-error TODO: url can be a string, not only an instance of URL
            url,
            options,
            context,
            info,
          );
        }),
        ...(config.plugins?.(ctx) || []),
      ],
    });
  } else {
    throw new Error('Unsupported gateway tester configuration');
  }

  const runtimeExecute = buildHTTPExecutor({
    endpoint: 'http://gateway/graphql',
    fetch: runtime.fetch,
    headers: (execReq) => execReq?.rootValue.headers,
  });

  return {
    runtime,
    // @ts-expect-error native and whatwg-node fetch has conflicts
    fetch: runtime.fetch,
    async execute(args) {
      return runtimeExecute({
        document: parse(args.query),
        variables: args.variables,
        operationName: args.operationName,
        extensions: args.extensions,
        rootValue: { headers: args.headers },
      });
    },
    [DisposableSymbols.asyncDispose]() {
      return runtime[DisposableSymbols.asyncDispose]();
    },
    async dispose() {
      await runtime.dispose();
    },
  };
}

interface GatewayTesterRemoteSchema {
  name: string;
  url: string;
  schema: GraphQLSchema;
  yoga: YogaServerInstance<any, any>;
}

function buildRemoteSchema(
  config: GatewayTesterRemoteSchemaConfig,
): GatewayTesterRemoteSchema {
  const schema =
    'typeDefs' in config.schema
      ? buildSubgraphSchema([
          {
            ...config.schema,
            typeDefs: parse(config.schema.typeDefs),
          },
        ])
      : config.schema;
  const yoga =
    typeof config.yoga === 'function'
      ? config.yoga?.(schema)
      : createYoga({
          maskedErrors: false,
          logging: false,
          ...config.yoga,
          schema,
        });
  const host = config.host || config.name;
  const url = `http://${host}${yoga.graphqlEndpoint}`;
  return {
    name: config.name,
    url,
    schema,
    yoga,
  };
}
