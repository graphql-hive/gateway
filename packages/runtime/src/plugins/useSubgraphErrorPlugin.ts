import { isAsyncIterable } from '@graphql-tools/utils';
import { GraphQLError } from 'graphql';
import { GatewayPlugin } from '../types';

export interface SubgraphErrorPluginOptions {
  /**
   * The error code for the error that occurred in the subgraph.
   *
   * If set to `false`, the error code will not be included in the error.
   *
   * @default 'DOWNSTREAM_SERVICE_ERROR'
   */
  errorCode?: string | false;

  /**
   * The name of the extension field for the name of the subgraph
   *
   * If set to `false`, the subgraph name will not be included in the error.
   *
   * @default 'serviceName'
   */
  subgraphNameProp?: string | false;
}

export function useSubgraphErrorPlugin<
  TContext extends Record<string, unknown>,
>({
  errorCode = 'DOWNSTREAM_SERVICE_ERROR',
  subgraphNameProp = 'serviceName',
}: SubgraphErrorPluginOptions = {}): GatewayPlugin<TContext> {
  function extendError(error: GraphQLError, subgraphName: string) {
    // @ts-expect-error - we know "extensions" is a property of GraphQLError
    const errorExtensions = (error.extensions ||= {});
    if (errorCode) {
      errorExtensions.code ||= errorCode;
    }
    if (subgraphNameProp) {
      errorExtensions[subgraphNameProp] ||= subgraphName;
    }
  }
  return {
    onSubgraphExecute({ subgraphName }) {
      return function ({ result }) {
        if (isAsyncIterable(result)) {
          return {
            onNext({ result }) {
              if (result.errors) {
                for (const error of result.errors) {
                  extendError(error, subgraphName);
                }
              }
            },
          };
        }
        if (result.errors) {
          for (const error of result.errors) {
            extendError(error, subgraphName);
          }
        }
        return;
      };
    },
  };
}
