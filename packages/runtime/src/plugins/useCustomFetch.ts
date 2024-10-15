import type { MeshFetch } from '@graphql-mesh/types';
import type { GatewayPlugin } from '../types';

export function useCustomFetch(fetch: MeshFetch): GatewayPlugin {
  return {
    onFetch({ setFetchFn }) {
      setFetchFn(fetch);
    },
  };
}
