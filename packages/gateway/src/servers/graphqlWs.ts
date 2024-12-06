// yoga's envelop may augment the `execute` and `subscribe` operations

import { GetEnvelopedFn } from '@envelop/core';
import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import { MaybePromise } from '@graphql-tools/utils';
import { type ExecutionArgs } from 'graphql';
import type { ConnectionInitMessage, Context, ServerOptions } from 'graphql-ws';

type Envelope = ReturnType<GetEnvelopedFn<unknown>>;

// so we need to make sure we always use the freshest instance
type EnvelopedExecutionArgs = ExecutionArgs & {
  rootValue: {
    execute: Envelope['execute'];
    subscribe: Envelope['subscribe'];
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
    onSubscribe: async (ctx, msg) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } =
        gwRuntime.getEnveloped({
          connectionParams: ctx.connectionParams,
          ...(await onContext(ctx)),
        });
      const args: EnvelopedExecutionArgs = {
        schema: schema || (await gwRuntime.getSchema()),
        operationName: msg.payload.operationName,
        document: parse(msg.payload.query),
        variableValues: msg.payload.variables,
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
