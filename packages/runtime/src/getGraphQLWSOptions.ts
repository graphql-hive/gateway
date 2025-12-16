// yoga's envelop may augment the `execute` and `subscribe` operations

import { MaybePromise } from '@graphql-tools/utils';
import { execute, subscribe, type ExecutionArgs } from 'graphql';
import type {
  ConnectionInitMessage,
  Context,
  ServerOptions,
  SubscribeMessage,
  SubscribePayload,
} from 'graphql-ws';
import type { GatewayRuntime } from './createGatewayRuntime';

// so we need to make sure we always use the freshest instance
type EnvelopedExecutionArgs = ExecutionArgs & {
  rootValue: {
    execute: typeof execute;
    subscribe: typeof subscribe;
  };
};

export function getGraphQLWSOptions<TContext extends Record<string, any>, E>(
  gwRuntime: GatewayRuntime<TContext>,
  onContext: (
    ctx: Context<ConnectionInitMessage['payload'], E>,
  ) => MaybePromise<Record<string, unknown>>,
): ServerOptions<ConnectionInitMessage['payload'], E> {
  return {
    execute: (args) => (args as EnvelopedExecutionArgs).rootValue.execute(args),
    subscribe: (args) =>
      (args as EnvelopedExecutionArgs).rootValue.subscribe(args),
    onSubscribe: async (ctx, idOrMessage, payloadOrUndefined) => {
      let payload: SubscribePayload;
      if (typeof idOrMessage === 'string') {
        // >=v6
        payload = payloadOrUndefined;
      } else {
        // <=v5
        payload = (idOrMessage as SubscribeMessage).payload;
      }

      const { schema, execute, subscribe, contextFactory, parse, validate } =
        gwRuntime.getEnveloped({
          connectionParams: {
            ...ctx.connectionParams,
            // Pass WebSocket extensions as connection params for the plugin
            // This allows the plugin to access persisted operation info
            ...payload.extensions,
          },
          waitUntil: gwRuntime.waitUntil,
          ...(await onContext(ctx)),
        });
      
      const args: EnvelopedExecutionArgs = {
        schema: schema || (await gwRuntime.getSchema()),
        operationName: payload.operationName,
        document: parse(payload.query),
        variableValues: payload.variables,
        contextValue: await contextFactory(),
        rootValue: {
          execute,
          subscribe,
        },
      };
      
      if (args.schema) {
        const errors = validate(args.schema, args.document);
        if (errors.length) return errors;
      }
      return args;
    },
  };
}
