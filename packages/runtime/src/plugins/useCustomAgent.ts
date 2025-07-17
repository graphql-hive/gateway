// eslint-disable-next-line import/no-nodejs-modules
import type { Agent as HttpAgent } from 'node:http';
// eslint-disable-next-line import/no-nodejs-modules
import type { Agent as HttpsAgent } from 'node:https';
import type {
  GatewayContext,
  GatewayPlugin,
  OnFetchHookPayload,
} from '../types';

export type AgentFactory<TContext> = (
  payload: OnFetchHookPayload<
    Partial<TContext> & GatewayContext & Record<string, any>
  >,
) => HttpAgent | HttpsAgent | false | undefined;

export function useCustomAgent<TContext extends Record<string, any>>(
  agentFactory: AgentFactory<TContext>,
): GatewayPlugin<TContext> {
  return {
    onFetch(payload) {
      const agent = agentFactory(payload);
      if (agent != null) {
        payload.setOptions({
          ...payload.options,
          // @ts-expect-error - `agent` is there
          agent,
        });
      }
    },
  };
}
