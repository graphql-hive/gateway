import type { HivePluginOptions } from '@graphql-hive/core';
import type { Logger } from '@graphql-hive/logger';
import { useHive } from '@graphql-hive/yoga';
import { MeshFetch } from '@graphql-mesh/types';
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
  clientInfo?:
    | HiveConsoleUsageClientInfo
    | ((context: any) => null | undefined | HiveConsoleUsageClientInfo);
}

export interface HiveConsoleUsageClientInfo {
  name: string;
  version: string;
}

type HiveUsagePluginOptions = Extract<HivePluginOptions['usage'], object>;

const defaultClientNameHeaders = [
  'x-graphql-client-name',
  'graphql-client-name',
];
const defaultClientVersionHeaders = [
  'x-graphql-client-version',
  'graphql-client-version',
];
function lookupHeader(
  headers: GatewayContext['headers'],
  possibleNames: string[],
) {
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
  ...options
}: HiveConsolePluginOptions & { log: Logger; fetch: MeshFetch }): GatewayPlugin<
  TPluginContext,
  TContext
> {
  const agent = {
    name: 'hive-gateway',
    version: globalThis.__VERSION__,
    fetch,
    ...options.agent,
  } as HiveConsolePluginOptions['agent'];

  // avoiding a breaking change by supporting the old usage option
  // which allowed passing an object to the clientInfo instead of a function
  // TODO: this approach is deprecated, please remove in the upcoming major version
  let usage: HiveUsagePluginOptions | boolean | undefined = undefined;
  if (options.usage && typeof options.usage === 'object') {
    usage = {
      ...options.usage,
      clientInfo:
        options.usage.clientInfo == null
          ? defaultClientInfoFactory
          : typeof options.usage.clientInfo === 'object'
            ? () =>
                // @ts-expect-error clientInfo will be an object
                options.usage!.clientInfo
            : options.usage.clientInfo,
    };
  } else {
    usage = options.usage;
  }

  // all of this trickery is required to make TS happy because hive client uses
  // the OptionalWhenFalse helper utility which is not properly inherited
  if (enabled && !token) {
    throw new Error('Hive plugin is enabled but the token is not provided');
  }

  // @ts-expect-error TODO: useHive plugin should inhert the TContext
  return useHive({
    logger: options.log,
    printTokenInfo: false,
    ...options,
    enabled: !!enabled,
    token: token!,
    agent,
    usage,
  });
}
