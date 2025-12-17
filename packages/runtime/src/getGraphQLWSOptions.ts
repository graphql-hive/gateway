// yoga's envelop may augment the `execute` and `subscribe` operations

import { MaybePromise } from '@graphql-tools/utils';
import { type ExecutionArgs } from 'graphql';
import type {
  ConnectionInitMessage,
  Context,
  ServerOptions,
  SubscribeMessage,
  SubscribePayload,
} from 'graphql-ws';
import { YogaInitialContext } from 'graphql-yoga';
import type { GatewayRuntime } from './createGatewayRuntime';

export function getGraphQLWSOptions<TContext extends Record<string, any>, E>(
  gwRuntime: GatewayRuntime<TContext>,
  onContext: (
    ctx: Context<ConnectionInitMessage['payload'], E>,
  ) => MaybePromise<Record<string, unknown>>,
): ServerOptions<ConnectionInitMessage['payload'], E> {
  async function onSubscribe(
    ctx: Context<Record<string, unknown> | undefined, E>,
    idOrMessage: string | SubscribeMessage,
    paramsOrUndefined: SubscribePayload | undefined,
  ): Promise<any | readonly import('graphql').GraphQLError[]> {
    let params: SubscribePayload;
    if (typeof idOrMessage === 'string') {
      // >=v6
      if (paramsOrUndefined == null) {
        throw new Error('Payload is required in graphql-ws v6+');
      }
      params = paramsOrUndefined;
    } else {
      // <=v5
      params = idOrMessage.payload;
    }

    // Fake execution args
    return {
      schema: await gwRuntime.getSchema(),
      document: {
        kind: 'Document',
        definitions: [
          {
            kind: 'OperationDefinition',
            operation: 'subscription',
            selectionSet: {
              kind: 'SelectionSet',
              selections: [],
            },
          },
        ],
      },
      contextValue: {
        connectionParams: ctx.connectionParams,
        waitUntil: gwRuntime.waitUntil,
        params,
        ...(await onContext(ctx)),
      },
    };
  }
  function handleRegularArgs(args: ExecutionArgs) {
    const context = args.contextValue as YogaInitialContext;
    return gwRuntime.getResultForParams(
      {
        params: context.params,
        request: context.request,
      },
      context,
    );
  }
  return {
    execute: handleRegularArgs,
    subscribe: handleRegularArgs,
    onSubscribe,
  };
}
