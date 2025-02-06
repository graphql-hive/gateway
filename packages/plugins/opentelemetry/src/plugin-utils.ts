import type { ExecutionRequest } from '@graphql-tools/utils';

export function withState<
  P,
  GraphqlState = object,
  HttpState = object,
  SubExecState = object,
>(plugin: WithState<P, HttpState, GraphqlState, SubExecState>): P {
  type States = {
    http?: WeakMap<Request, Partial<HttpState>>;
    graphql?: WeakMap<any, Partial<GraphqlState>>;
    gateway?: WeakMap<ExecutionRequest, Partial<SubExecState>>;
  };

  let states: States = {};

  function getState<Scope extends keyof States>(
    scope: Scope,
    key: NonNullable<States[Scope]> extends WeakMap<infer K, any> ? K : never,
  ): NonNullable<States[Scope]> extends WeakMap<any, infer V> ? V : never {
    if (!states[scope]) states[scope] = new WeakMap<any, any>();
    let state = states[scope].get(key as any);
    if (!state) {
      state = {};
      states[scope].set(key, state as any);
    }
    return state as any;
  }

  let pluginWithState: GenericPlugin = {};
  for (const hookName in plugin) {
    const hook = (plugin as GenericPlugin)[hookName];
    if (hook) {
      pluginWithState[hookName] = (payload) => {
        const { executionRequest, context, request } = payload;
        let state = {};
        if (executionRequest && executionRequest.context) {
          // It can happen that an execution request occurs without a GraphQL context.
          // In this case we don't have a state for operation or request.
          if (executionRequest.context) {
            state = {
              get forRequest() {
                return getState('http', executionRequest.context.request);
              },
              get forOperation() {
                return getState('graphql', executionRequest.context);
              },
              get forSubgraphExecution() {
                return getState('gateway', executionRequest);
              },
            };
          } else {
            state = {
              get forSubgraphExecution() {
                return getState('gateway', executionRequest);
              },
            };
          }
        } else if (context)
          state = {
            get forRequest() {
              return getState('http', context.request);
            },
            get forOperation() {
              return getState('graphql', context);
            },
          };
        else if (request) {
          state = {
            get forRequest() {
              return getState('http', request);
            },
          };
        }
        return hook({ ...payload, state });
      };
    }
  }

  return pluginWithState as P;
}

type GenericPlugin = Record<string, (payload: any) => unknown>;

export type HttpState<T> = {
  forRequest: Partial<T>;
};

export type GraphQLState<T> = {
  forOperation: Partial<T>;
};

export type GatewayState<T> = {
  forSubgraphExecution: Partial<T>;
};

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
