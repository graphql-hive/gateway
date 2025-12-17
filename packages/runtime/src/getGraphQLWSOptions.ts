// yoga's envelop may augment the `execute` and `subscribe` operations

import { MaybePromise } from '@graphql-tools/utils';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import {
  DocumentNode,
  Kind,
  OperationTypeNode,
  type ExecutionArgs,
} from 'graphql';
import type {
  ConnectionInitMessage,
  Context,
  ServerOptions,
  SubscribeMessage,
  SubscribePayload,
} from 'graphql-ws';
import { YogaInitialContext, YogaServerInstance } from 'graphql-yoga';

const FAKE_DOCUMENT: DocumentNode = {
  kind: Kind.DOCUMENT,
  definitions: [
    {
      kind: Kind.OPERATION_DEFINITION,
      operation: OperationTypeNode.SUBSCRIPTION,
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [],
      },
    },
  ],
};

// This is not Gateway specific, but we keep it here for now
// Then this can be moved to graphql-yoga
export function getGraphQLWSOptions<TContext extends Record<string, any>, E>(
  yoga: YogaServerInstance<Record<string, any>, TContext>,
  onContext: (
    ctx: Context<ConnectionInitMessage['payload'], E>,
  ) => MaybePromise<Record<string, unknown>>,
): ServerOptions<ConnectionInitMessage['payload'], E> {
  function onSubscribe(
    ctx: Context<Record<string, unknown> | undefined, E>,
    idOrMessage: string | SubscribeMessage,
    paramsOrUndefined: SubscribePayload | undefined,
  ): MaybePromise<ExecutionArgs> {
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

    return handleMaybePromise(
      () => onContext(ctx),
      (additionalContext) =>
        ({
          // Relax this check https://github.com/enisdenjo/graphql-ws/blob/master/src/server.ts#L805
          // We don't need `schema` here as it is handled by the gateway runtime
          document: FAKE_DOCUMENT,
          contextValue: {
            connectionParams: ctx.connectionParams,
            waitUntil: yoga.waitUntil,
            params,
            ...additionalContext,
          },
          // So we cast it to ExecutionArgs to satisfy the return type without `schema`
        }) as ExecutionArgs,
    );
  }
  function handleRegularArgs(args: ExecutionArgs) {
    // We know that contextValue is YogaInitialContext
    const context = args.contextValue as YogaInitialContext & TContext;
    return yoga.getResultForParams(
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
