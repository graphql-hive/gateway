import type { Logger } from '@graphql-hive/gateway-runtime';
import type { MeshFetch } from '@graphql-mesh/types';

export interface PluginContext {
  log: Logger;
  fetch?: typeof fetch | MeshFetch;
}
