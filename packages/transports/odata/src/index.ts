import {
  createDefaultExecutor,
  type Transport,
} from '@graphql-mesh/transport-common';
import { processDirectives } from '@omnigraph/odata';

export default {
  getSubgraphExecutor({ subgraph, fetch }) {
    if (!fetch) {
      throw new Error('Fetch implementation is required');
    }
    return createDefaultExecutor(
      processDirectives({
        schema: subgraph,
        fetchFn: fetch,
      }),
    );
  },
} satisfies Transport;
