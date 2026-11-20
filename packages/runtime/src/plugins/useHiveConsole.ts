import {
  addHiveTypenames,
  hideInjectedTypenames,
  type CollectUsageOptions,
  type GraphVersionInfo,
  type HivePluginOptions,
} from '@graphql-hive/core';
import type { Logger } from '@graphql-hive/logger';
import { createHive, useHive } from '@graphql-hive/yoga';
import { MeshFetch } from '@graphql-mesh/types';
import { isAsyncIterable } from '@graphql-tools/utils';
import type { DocumentNode, GraphQLSchema } from 'graphql';
import { GatewayContext, GatewayPlugin } from '../types';

export interface HiveConsolePluginOptions extends Omit<
  HivePluginOptions,
  'usage'
> {
  usage?: HiveConsoleUsagePluginOptions | boolean | undefined;
}

export interface HiveConsoleUsagePluginOptions extends Omit<
  HiveUsagePluginOptions,
  'clientInfo'
> {
  /**
   * Extract client info from the GraphQL Context.
   */
  clientInfo?: (
    context: GatewayContext,
  ) => null | undefined | HiveConsoleUsageClientInfo;
}

export interface HiveConsoleUsageClientInfo {
  name: string;
  version: string;
}

type HiveUsagePluginOptions = Extract<HivePluginOptions['usage'], object>;

const defaultClientNameHeaders = [
  'graphql-client-name',
  'x-graphql-client-name',
];
const defaultClientVersionHeaders = [
  'graphql-client-version',
  'x-graphql-client-version',
];
function lookupHeader(
  headers: GatewayContext['headers'],
  possibleNames: string[],
) {
  if (headers == null) {
    return null;
  }
  for (const name of possibleNames) {
    const value = headers[name];
    if (value) {
      return value;
    }
  }
  return null;
}
function defaultClientInfoFactory(
  context: GatewayContext,
): HiveConsoleUsageClientInfo | null {
  const name = lookupHeader(context.headers, defaultClientNameHeaders);
  const version = lookupHeader(context.headers, defaultClientVersionHeaders);
  if (name) {
    return {
      name,
      version: version ?? 'unknown',
    };
  }
  return null;
}

export default function useHiveConsole<
  TPluginContext extends Record<string, any> = Record<string, any>,
  TContext extends Record<string, any> = Record<string, any>,
>({
  enabled,
  token,
  getGraphVersion,
  ...options
}: HiveConsolePluginOptions & {
  log: Logger;
  fetch: MeshFetch;
  /**
   * The graph version of the executed schema, reported along with the usage.
   */
  getGraphVersion?: (schema: GraphQLSchema) => GraphVersionInfo | undefined;
}): GatewayPlugin<TPluginContext, TContext> {
  const agent = {
    name: 'hive-gateway',
    version: globalThis.__VERSION__,
    fetch: options.fetch,
    ...options.agent,
  } as HiveConsolePluginOptions['agent'];

  let usage: HiveUsagePluginOptions | boolean | undefined = undefined;
  if (options.usage && typeof options.usage === 'object') {
    usage = {
      ...options.usage,
      clientInfo: options.usage.clientInfo ?? defaultClientInfoFactory,
    };
  } else {
    usage = options.usage;
  }

  // all of this trickery is required to make TS happy because hive client uses
  // the OptionalWhenFalse helper utility which is not properly inherited
  if (enabled && !token) {
    throw new Error('Hive plugin is enabled but the token is not provided');
  }

  const hive = createHive({
    logger: options.log,
    printTokenInfo: false,
    ...options,
    enabled: !!enabled,
    token: token!,
    agent,
    usage,
  });
  if (getGraphVersion) {
    // the gateway knows which graph version it serves, the yoga plugin does not
    const { collectUsage, collectSubscriptionUsage } = hive;
    hive.collectUsage = (collectOptions) => {
      // the executed schema is known only once the operation finishes
      const options: CollectUsageOptions = { ...collectOptions };
      const collector = collectUsage(options);
      return {
        ...collector,
        finish(args, ...rest) {
          options.graph ??= getGraphVersion(args.schema);
          return collector.finish(args, ...rest);
        },
      };
    };
    hive.collectSubscriptionUsage = (args) =>
      collectSubscriptionUsage({
        ...args,
        graph: getGraphVersion(args.args.schema),
      });
  }

  const hivePlugin = useHive(hive);
  if (typeof usage !== 'object' || !usage.fieldLevelMetricsEnabled) {
    // @ts-expect-error TODO: useHive plugin should inhert the TContext
    return hivePlugin;
  }

  // useHive does not inject the typenames needed for field level metrics when given
  // a client instead of options, so the gateway injects (and hides) them instead
  const typenamedDocuments = new WeakMap<
    GraphQLSchema,
    WeakMap<DocumentNode, DocumentNode>
  >();
  return {
    onPluginInit({ addPlugin }) {
      addPlugin({
        onExecute({ args, executeFn, setExecuteFn }) {
          let documents = typenamedDocuments.get(args.schema);
          if (!documents) {
            documents = new WeakMap();
            typenamedDocuments.set(args.schema, documents);
          }
          let document = documents.get(args.document);
          if (!document) {
            document = addHiveTypenames(args.document, args.schema);
            documents.set(args.document, document);
          }
          if (document === args.document) {
            return;
          }
          setExecuteFn((executionArgs) =>
            executeFn({ ...executionArgs, document }),
          );
          return {
            // runs before the hive plugin reports the result, like useHive does
            onExecuteDone({ result }) {
              if (!isAsyncIterable(result)) {
                hideInjectedTypenames(result.data);
                return;
              }
              return {
                onNext({ result }) {
                  hideInjectedTypenames(result.data);
                },
              };
            },
          };
        },
      });
      // @ts-expect-error TODO: useHive plugin should inhert the TContext
      addPlugin(hivePlugin);
    },
  };
}
