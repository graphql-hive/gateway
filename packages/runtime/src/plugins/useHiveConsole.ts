import type { HivePluginOptions } from '@graphql-hive/core';
import { createHive } from '@graphql-hive/core';
import { useHive } from '@graphql-hive/yoga';
import { process } from '@graphql-mesh/cross-helpers';
import type { Logger } from '@graphql-mesh/types';
import { GatewayPlugin } from '../types';

export interface HiveConsolePluginOptions
  extends Omit<HivePluginOptions, 'usage'> {
  usage?: HiveConsoleUsagePluginOptions | boolean | undefined;
}

export interface HiveConsoleUsagePluginOptions
  extends Omit<HiveUsagePluginOptions, 'clientInfo'> {
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

export default function useHiveConsole<
  TPluginContext extends Record<string, any> = Record<string, any>,
  TContext extends Record<string, any> = Record<string, any>,
>({
  enabled,
  token,
  ...options
}: HiveConsolePluginOptions & { logger: Logger }): GatewayPlugin<
  TPluginContext,
  TContext
> {
  const agent: HiveConsolePluginOptions['agent'] = {
    name: 'hive-gateway',
    logger: options.logger,
    ...options.agent,
  };

  // avoiding a breaking change by supporting the old usage option
  // which allowed passing an object to the clientInfo instead of a function
  // TODO: this approach is deprecated, please remove in the upcoming major version
  let usage: HiveUsagePluginOptions | boolean | undefined = undefined;
  if (options.usage && typeof options.usage === 'object') {
    usage = {
      ...options.usage,
      clientInfo:
        typeof options.usage.clientInfo === 'object'
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
  const hive = createHive(
    enabled
      ? {
          debug: ['1', 'y', 'yes', 't', 'true'].includes(
            String(process.env['DEBUG']),
          ),
          ...options,
          enabled: true,
          token: token!,
          agent,
          usage,
        }
      : {
          debug: ['1', 'y', 'yes', 't', 'true'].includes(
            String(process.env['DEBUG']),
          ),
          ...options,
          enabled: false,
          token,
          agent,
          usage,
        },
  );
  const hivePlugin = useHive(hive);

  // @ts-expect-error TODO: useHive plugin should inhert the TContext
  return {
    ...hivePlugin,
    onDispose: () => hive.dispose(),
  };
}
