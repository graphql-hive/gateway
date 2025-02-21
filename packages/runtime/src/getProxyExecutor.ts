import type {
  OnSubgraphExecuteHook,
  Tracer,
  TransportEntry,
} from '@graphql-mesh/fusion-runtime';
import { getOnSubgraphExecute } from '@graphql-mesh/fusion-runtime';
import type { Executor } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import type { GatewayConfigContext, GatewayConfigProxy } from './types';

export function getProxyExecutor<TContext extends Record<string, any>>({
  config,
  configContext,
  getSchema,
  onSubgraphExecuteHooks,
  transportExecutorStack,
  tracer,
}: {
  config: GatewayConfigProxy<TContext>;
  configContext: GatewayConfigContext;
  getSchema: () => GraphQLSchema;
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  transportExecutorStack: AsyncDisposableStack;
  tracer?: Tracer;
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
        }
        return fakeTransportEntryMap[subgraphNameProp];
      },
    }),
    transportContext: configContext,
    getSubgraphSchema: getSchema,
    transportExecutorStack,
    transports: config.transports,
    tracer: tracer,
  });
  return function proxyExecutor(executionRequest) {
    return onSubgraphExecute(subgraphName, executionRequest);
  };
}
