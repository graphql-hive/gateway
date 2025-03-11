import type { HivePluginOptions } from '@graphql-hive/core';
import { useHive } from '@graphql-hive/yoga';
import type { Logger } from '@graphql-mesh/types';
import { GatewayPlugin } from '../types';

export type HiveConsolePluginOptions = HivePluginOptions;

export default function useHiveConsole<
  TPluginContext extends Record<string, any> = Record<string, any>,
  TContext extends Record<string, any> = Record<string, any>,
>(
  options: HiveConsolePluginOptions & { logger: Logger },
): GatewayPlugin<TPluginContext, TContext> {
  const agent: HiveConsolePluginOptions['agent'] = {
    name: 'graphql-hive-gateway',
    logger: options.logger,
    ...options.agent,
  };
  // @ts-expect-error TODO: useHive plugin should inhert the TContext
  return useHive({
    ...options,
    agent,
  });
}
