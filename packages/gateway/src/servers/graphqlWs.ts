// yoga's envelop may augment the `execute` and `subscribe` operations

import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import { execute, subscribe, type ExecutionArgs } from 'graphql';
import type { ServerOptions } from 'graphql-ws';

// so we need to make sure we always use the freshest instance
type EnvelopedExecutionArgs = ExecutionArgs & {
  rootValue: {
    execute: typeof execute;
    subscribe: typeof subscribe;
  };
};

export function getGraphQLWSOptions<TContext extends Record<string, any>>(
  gwRuntime: GatewayRuntime<TContext>,
): ServerOptions<any, any> {
  return {
    execute: (args) => (args as EnvelopedExecutionArgs).rootValue.execute(args),
    subscribe: (args) =>
      (args as EnvelopedExecutionArgs).rootValue.subscribe(args),
    onSubscribe: async (ctx, msg) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } =
        gwRuntime.getEnveloped({
          connectionParams: ctx.connectionParams,
          req: ctx.extra?.request,
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
