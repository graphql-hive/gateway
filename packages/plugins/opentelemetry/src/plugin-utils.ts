import type { ExecutionRequest } from '@graphql-tools/utils';

export function withState<
  P,
  HttpState = object,
  GraphqlState = object,
  SubExecState = object,
>(plugin: WithState<P, HttpState, GraphqlState, SubExecState>): P {
  const states: {
    forRequest?: WeakMap<Request, Partial<HttpState>>;
    forOperation?: WeakMap<any, Partial<GraphqlState>>;
    forSubgraphExecution?: WeakMap<ExecutionRequest, Partial<SubExecState>>;
  } = {};

  function getProp(scope: keyof typeof states, key: any): PropertyDescriptor {
    return {
      get() {
        if (!states[scope]) states[scope] = new WeakMap<any, any>();
        let value = states[scope].get(key as any);
        if (!value) states[scope].set(key, (value = {}));
        return value;
      },
      enumerable: true,
    };
  }

  const pluginWithState: Record<string, (payload: any) => unknown> = {};
  for (const [hookName, hook] of Object.entries(plugin) as any) {
    pluginWithState[hookName] = (payload) =>
      hook({
        ...payload,
        get state() {
          let { executionRequest, context, request } = payload;

          const state = {};
          const defineState = (scope: keyof typeof states, key: any) =>
            Object.defineProperty(state, scope, getProp(scope, key));

          if (executionRequest) {
            defineState('forSubgraphExecution', executionRequest);
            if (executionRequest.context) context = executionRequest.context;
          }
          if (context) {
            defineState('forOperation', context);
            if (context.request) request = context.request;
          }
          if (request) {
            defineState('forRequest', request);
          }
          return state;
        },
      });
  }

  return pluginWithState as P;
}

export type HttpState<T> = {
  forRequest: Partial<T>;
};

export type GraphQLState<T> = {
  forOperation: Partial<T>;
};

export type GatewayState<T> = {
  forSubgraphExecution: Partial<T>;
};

export function getMostSpecificState<T>(
  state: Partial<HttpState<T> & GraphQLState<T> & GatewayState<T>> = {},
): Partial<T> | undefined {
  const { forOperation, forRequest, forSubgraphExecution } = state;
  return forSubgraphExecution ?? forOperation ?? forRequest;
}

// Brace yourself! TS Wizardry is coming!

type PayloadWithState<T, Http, GraphQL, Gateway> = T extends {
  executionRequest: any;
}
  ? T & {
      state: Partial<HttpState<Http> & GraphQLState<GraphQL>> &
        GatewayState<Gateway>;
    }
  : T extends {
        executionRequest?: any;
      }
    ? T & {
        state: Partial<
          HttpState<Http> & GraphQLState<GraphQL> & GatewayState<Gateway>
        >;
      }
    : T extends { context: any }
      ? T & { state: HttpState<Http> & GraphQLState<GraphQL> }
      : T extends { request: any }
        ? T & { state: HttpState<Http> }
        : T;

type WithState<P, Http = object, GraphQL = object, Gateway = object> = {
  [K in keyof P]: P[K] extends ((payload: infer T) => infer R) | undefined
    ? (payload: PayloadWithState<T, Http, GraphQL, Gateway>) => R | undefined
    : P[K];
};
