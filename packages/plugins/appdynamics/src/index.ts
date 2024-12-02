import { type GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { Logger } from '@graphql-mesh/types';
import { Agent, TimePromise } from './appdynamics';

type AppDynamicsPluginOptions = {
  logger: Logger;
  appd: Agent;
};

export default function useAppDynamics(
  options: AppDynamicsPluginOptions,
): GatewayPlugin {
  const logger = options.logger.child('AppDynamics');
  const txByRequest = new WeakMap<Request, TimePromise>();
  const appd = options.appd;

  return {
    //@ts-expect-error TODO: how to declare this actually exists if we are running on Node ?
    onRequest({ request, serverContext: { req } }) {
      try {
        const tx =
          appd.getTransaction(req) ??
          appd.startTransaction(
            request.headers.get(appd.__agent.correlation.HEADER_NAME),
          );
        txByRequest.set(request, tx);
      } catch (err) {
        logger.error('failed to get or start transaction:', err);
      }
    },
    onFetch({ context: { request }, fetchFn, setFetchFn }) {
      const tx = txByRequest.get(request);
      if (!tx) {
        return;
      }

      setFetchFn((...args) => {
        tx.resume(); // Not sure it is needed, let's see if it's working with it, and try to remove it to see the effect
        return fetchFn(...args);
      });
    },
    onResponse({ request }) {
      try {
        const tx = txByRequest.get(request);
        tx?.end();
      } catch (err) {
        logger.error('failed to end the transaction', err);
      }
    },
  };
}
