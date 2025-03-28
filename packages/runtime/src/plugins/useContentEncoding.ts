import type { ExecutionRequest } from '@graphql-tools/utils';
import { useContentEncoding as useOrigContentEncoding } from '@whatwg-node/server';
import type { FetchAPI } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export interface UseContentEncodingOpts {
  subgraphs?: string[];
}

export function useContentEncoding<TContext extends Record<string, any>>({
  subgraphs,
}: UseContentEncodingOpts = {}): GatewayPlugin<TContext> {
  if (!subgraphs?.length) {
    // @ts-expect-error - Return types are not compatible
    return useOrigContentEncoding();
  }
  const compressionAlgorithm: CompressionFormat = 'gzip';
  let fetchAPI: FetchAPI;
  const execReqWithContentEncoding = new WeakSet<ExecutionRequest>();
  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onPluginInit({ addPlugin }) {
      addPlugin(
        // @ts-expect-error - Plugin types do not match
        useOrigContentEncoding(),
      );
    },
    onSubgraphExecute({ subgraphName, executionRequest }) {
      if (subgraphs.includes(subgraphName) || subgraphs.includes('*')) {
        execReqWithContentEncoding.add(executionRequest);
      }
    },
    onFetch({ executionRequest, options, setOptions }) {
      if (
        options.body &&
        !options.headers?.['Content-Encoding'] &&
        executionRequest &&
        execReqWithContentEncoding.has(executionRequest) &&
        fetchAPI.CompressionStream
      ) {
        const compressionStream = new fetchAPI.CompressionStream(
          compressionAlgorithm,
        );
        let bodyStream: ReadableStream;
        if (options.body instanceof fetchAPI.ReadableStream) {
          bodyStream = options.body;
        } else {
          // Create a fake Response and use its body to pipe through the compression stream
          bodyStream = new fetchAPI.Response(options.body).body!;
        }
        setOptions({
          ...options,
          headers: {
            'Accept-Encoding': 'gzip, deflate',
            ...options.headers,
            'Content-Encoding': compressionAlgorithm,
          },
          body: bodyStream.pipeThrough(compressionStream),
        });
      }
    },
  };
}
