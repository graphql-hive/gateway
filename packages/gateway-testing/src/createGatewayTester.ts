import {
  createGatewayRuntime,
  GatewayConfigSchemaBase,
  GatewayRuntime,
  UnifiedGraphConfig,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import {
  getUnifiedGraphGracefully,
  type SubgraphConfig,
} from '@graphql-mesh/fusion-composition';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import type { ExecutionResult, MaybeAsyncIterable } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { createYoga, type YogaServerInstance } from 'graphql-yoga';

export type GatewayTesterConfig<
  TContext extends Record<string, any> = Record<string, any>,
> = GatewayConfigSchemaBase<TContext> &
  (
    | {
        // gateway
        supergraph: UnifiedGraphConfig;
      }
    | {
        // gateway (composes subgraphs)
        subgraphs: SubgraphConfig[];
      }
  );
// TODO: proxy mode
// TODO: subgraph mode

export interface GatewayTester<
  TContext extends Record<string, any> = Record<string, any>,
> {
  runtime: GatewayRuntime<TContext>;
  fetch: typeof fetch;
  execute(args: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
    extensions?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<MaybeAsyncIterable<ExecutionResult<any>>>;
}

export function createGatewayTester<
  TContext extends Record<string, any> = Record<string, any>,
>(config: GatewayTesterConfig<TContext>): GatewayTester<TContext> {
  //
  let runtime: GatewayRuntime<TContext>;
  if ('supergraph' in config) {
    runtime = createGatewayRuntime(config);
  } else {
    // compose subgraphs and create runtime
    const subgraphs = config.subgraphs.reduce(
      (acc, subgraph) => ({
        ...acc,
        [subgraph.name]: {
          ...subgraph,
          url: subgraph.url || `http://${subgraph.name}/graphql`,
          yoga: createYoga({
            schema: subgraph.schema,
            // TODO: toggle if necessary for testing
            logging: false,
          }),
        },
      }),
      {} as Record<
        string,
        SubgraphConfig & { yoga: YogaServerInstance<any, any> }
      >,
    );
    runtime = createGatewayRuntime({
      ...config,
      supergraph: getUnifiedGraphGracefully(Object.values(subgraphs)),
      plugins: (ctx) => [
        useCustomFetch((url, options, context, info) => {
          const subgraph = subgraphs[context.subgraphName];
          if (!subgraph) {
            throw new Error(
              `Subgraph with name "${context.subgraphName}" not found`,
            );
          }
          return subgraph.yoga.fetch(
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
  }

  const runtimeExecute = buildHTTPExecutor({
    fetch: runtime.fetch,
    headers: (execReq) => execReq?.rootValue.headers,
  });

  return {
    runtime,
    execute(args) {
      return runtimeExecute({
        document: parse(args.query),
        variables: args.variables,
        operationName: args.operationName,
        extensions: args.extensions,
        rootValue: { headers: args.headers },
      });
    },
    // @ts-expect-error native and whatwg-node fetch has conflicts
    fetch: runtime.fetch,
  };
}
