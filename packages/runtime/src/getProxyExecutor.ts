import { LegacyLogger } from '@graphql-hive/logger';
import type {
  Instrumentation,
  OnSubgraphExecuteHook,
  TransportEntry,
} from '@graphql-mesh/fusion-runtime';
import { getOnSubgraphExecute } from '@graphql-mesh/fusion-runtime';
import { mergeDeep, type Executor } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import type { GatewayConfigContext, GatewayConfigProxy } from './types';

export function getProxyExecutor<TContext extends Record<string, any>>({
  config,
  configContext,
  getSchema,
  onSubgraphExecuteHooks,
  transportExecutorStack,
  instrumentation,
}: {
  config: GatewayConfigProxy<TContext>;
  configContext: GatewayConfigContext;
  getSchema: () => GraphQLSchema;
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  transportExecutorStack: AsyncDisposableStack;
  instrumentation: () => Instrumentation | undefined;
}): Executor {
  const fakeTransportEntryMap: Record<string, TransportEntry> = {};
  let subgraphName: string = 'upstream';
  const onSubgraphExecute = getOnSubgraphExecute({
    onSubgraphExecuteHooks,
    transportEntryMap: new Proxy(fakeTransportEntryMap, {
      get(fakeTransportEntryMap, subgraphNameProp: string): TransportEntry {
        if (!fakeTransportEntryMap[subgraphNameProp]) {
          subgraphName = subgraphNameProp;
          fakeTransportEntryMap[subgraphNameProp] = {
            kind: 'http',
            subgraph: subgraphName.toString(),
            location: config.proxy?.endpoint,
            headers: config.proxy?.headers as any,
            options: config.proxy,
          };
          if (config.transportEntries) {
            fakeTransportEntryMap[subgraphNameProp] = mergeDeep([
              fakeTransportEntryMap[subgraphNameProp],
              ...Object.values(config.transportEntries),
            ]) as TransportEntry;
          }
        }
        return fakeTransportEntryMap[subgraphNameProp];
      },
    }),
    transportContext: {
      ...configContext,
      logger: LegacyLogger.from(configContext.log),
    },
    getSubgraphSchema: getSchema,
    transportExecutorStack,
    transports: config.transports,
    instrumentation: instrumentation,
  });
  return function proxyExecutor(executionRequest) {
    return onSubgraphExecute(subgraphName, executionRequest);
  };
}
