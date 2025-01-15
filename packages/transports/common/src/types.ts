import type {
  KeyValueCache,
  Logger,
  MeshFetch,
  MeshPubSub,
} from '@graphql-mesh/types';
import type { Executor, MaybePromise } from '@graphql-tools/utils';
import type { GraphQLError, GraphQLSchema } from 'graphql';

export interface Transport<
  Options extends Record<string, any> = Record<string, any>,
> {
  getSubgraphExecutor: TransportGetSubgraphExecutor<Options>;
}

export interface TransportEntry<
  Options extends Record<string, any> = Record<string, any>,
> {
  kind: string;
  subgraph: string;
  location?: string;
  headers?: [string, string][];
  options?: Options;
}

export interface TransportContext {
  fetch?: MeshFetch;
  pubsub?: MeshPubSub;
  logger?: Logger;
  cwd?: string;
  cache?: KeyValueCache;
}

export interface TransportGetSubgraphExecutorOptions<
  Options extends Record<string, any> = Record<string, any>,
> extends TransportContext {
  subgraphName: string;
  transportEntry: TransportEntry<Options>;
  getTransportExecutor(transportEntry: TransportEntry): MaybePromise<Executor>;
  subgraph: GraphQLSchema;
  getDisposeReason?: () => GraphQLError | undefined;
}

export type TransportExecutorFactoryGetter = (
  kind: string,
) => MaybePromise<TransportGetSubgraphExecutor>;

export type TransportGetSubgraphExecutor<
  Options extends Record<string, any> = Record<string, any>,
> = (
  opts: TransportGetSubgraphExecutorOptions<Options>,
) => MaybePromise<Executor>;

export type DisposableExecutor = Executor &
  Partial<Disposable | AsyncDisposable>;

export interface UpstreamErrorExtensions {
  subgraph?: string;
  request: {
    url?: string;
    method?: string;
    body?: unknown;
  };
  response?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
}
export { type Executor };
