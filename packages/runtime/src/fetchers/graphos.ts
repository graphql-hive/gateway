import {
  DEFAULT_UPLINKS,
  fetchSupergraphSdlFromManagedFederation,
} from '@graphql-tools/federation';
import { mapMaybePromise, type MaybePromise } from '@graphql-tools/utils';
import type {
  GatewayConfigContext,
  GatewayGraphOSManagedFederationOptions,
} from '../index';

export interface CreateGraphOSFetcherOpts {
  graphosOpts: GatewayGraphOSManagedFederationOptions;
  configContext: GatewayConfigContext;
}

const defaultLoadedPlacePrefix = 'GraphOS Managed Federation';

export function createGraphOSFetcher({
  graphosOpts,
  configContext,
}: CreateGraphOSFetcherOpts) {
  let lastSeenId: string;
  let lastSupergraphSdl: string;
  let nextFetchTime: number;
  const uplinksParam =
    graphosOpts.upLink || process.env['APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT'];
  const uplinks =
    uplinksParam?.split(',').map((uplink) => uplink.trim()) || DEFAULT_UPLINKS;
  const graphosLogger = configContext.logger.child('GraphOS');
  graphosLogger.info(
    'Using GraphOS Managed Federation with uplinks: ',
    ...uplinks,
  );
  const maxRetries = graphosOpts.maxRetries || Math.max(3, uplinks.length);
  let supergraphLoadedPlace = defaultLoadedPlacePrefix;
  if (graphosOpts.graphRef) {
    supergraphLoadedPlace += ` <br>${graphosOpts.graphRef}`;
  }
  return {
    supergraphLoadedPlace,
    unifiedGraphFetcher() {
      const uplinksToUse: string[] = [];
      let retries = graphosOpts.maxRetries || Math.max(3, uplinks.length);
      const fetchSupergraphWithDelay = (): MaybePromise<string> => {
        if (nextFetchTime) {
          const currentTime = Date.now();
          if (nextFetchTime >= currentTime) {
            const delay = nextFetchTime - currentTime;
            graphosLogger.info(`Fetching supergraph with delay: ${delay}ms`);
            return new Promise((resolve) =>
              setTimeout(() => {
                nextFetchTime = 0;
                resolve(fetchSupergraph());
              }, delay),
            );
          }
        }
        return fetchSupergraph();
      };
      const fetchSupergraph = (): MaybePromise<string> => {
        if (uplinksToUse.length === 0) {
          uplinksToUse.push(...uplinks);
        }
        retries--;
        try {
          const uplinkToUse = uplinksToUse.pop();
          const attemptLogger = graphosLogger.child(
            `Attempt ${maxRetries - retries} - UpLink: ${uplinkToUse}`,
          );
          attemptLogger.debug(`Fetching supergraph`);
          return mapMaybePromise(
            fetchSupergraphSdlFromManagedFederation({
              graphRef: graphosOpts.graphRef,
              apiKey: graphosOpts.apiKey,
              upLink: uplinkToUse,
              lastSeenId,
              // @ts-expect-error TODO: what's up with type narrowing
              fetch: configContext.fetch,
              loggerByMessageLevel: {
                ERROR(message) {
                  attemptLogger.error(message);
                },
                INFO(message) {
                  attemptLogger.info(message);
                },
                WARN(message) {
                  attemptLogger.warn(message);
                },
              },
            }),
            (result) => {
              if (result.minDelaySeconds) {
                attemptLogger.debug(
                  `Setting min delay to ${result.minDelaySeconds}s`,
                );
                nextFetchTime = Date.now() + result.minDelaySeconds * 1000;
              }
              if ('error' in result) {
                attemptLogger.error(result.error.code, result.error.message);
                if (retries > 0) {
                  return fetchSupergraphWithDelay();
                }
              }
              if ('id' in result) {
                lastSeenId = result.id;
              }
              if ('supergraphSdl' in result) {
                attemptLogger.info(
                  `Fetched the new supergraph ${lastSeenId ? `with id ${lastSeenId}` : ''}`,
                );
                lastSupergraphSdl = result.supergraphSdl;
              }
              if (!lastSupergraphSdl) {
                if (retries > 0) {
                  return fetchSupergraphWithDelay();
                }
                throw new Error('Failed to fetch supergraph SDL');
              }
              return lastSupergraphSdl;
            },
            (err) => {
              configContext.logger.child('GraphOS').error(err);
              if (retries > 0) {
                return fetchSupergraphWithDelay();
              }
              return lastSupergraphSdl;
            },
          );
        } catch (e) {
          configContext.logger.child('GraphOS').error(e);
          if (retries > 0) {
            return fetchSupergraphWithDelay();
          }
          return lastSupergraphSdl;
        }
      };
      return fetchSupergraphWithDelay();
    },
  };
}
