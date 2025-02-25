import { TransportContext } from '@graphql-mesh/transport-common';
import {
  DEFAULT_UPLINKS,
  fetchSupergraphSdlFromManagedFederation,
} from '@graphql-tools/federation';
import type {
  GatewayConfigContext,
  GatewayGraphOSManagedFederationOptions,
} from '../index';
import { delayInMs } from '../utils';

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
  const graphosLogger = configContext.logger.child({ source: 'GraphOS' });
  graphosLogger.info('Using Managed Federation with uplinks: ', ...uplinks);
  const maxRetries = graphosOpts.maxRetries || Math.max(3, uplinks.length);
  let supergraphLoadedPlace = defaultLoadedPlacePrefix;
  if (graphosOpts.graphRef) {
    supergraphLoadedPlace += ` <br>${graphosOpts.graphRef}`;
  }
  return {
    supergraphLoadedPlace,
    unifiedGraphFetcher(transportContext: TransportContext) {
      const uplinksToUse: string[] = [];
      let retries = maxRetries;
      function fetchSupergraphWithDelay(): Promise<string> {
        if (nextFetchTime) {
          const currentTime = Date.now();
          if (nextFetchTime >= currentTime) {
            const delay = nextFetchTime - currentTime;
            graphosLogger.info(`Fetching supergraph with delay: ${delay}ms`);
            nextFetchTime = 0;
            return delayInMs(delay).then(fetchSupergraph);
          }
        }
        return fetchSupergraph();
      }
      function fetchSupergraph(): Promise<string> {
        if (uplinksToUse.length === 0) {
          uplinksToUse.push(...uplinks);
        }
        retries--;
        const uplinkToUse = uplinksToUse.pop();
        const attemptLogger = graphosLogger.child({
          attempt: maxRetries - retries,
          uplink: uplinkToUse || 'none',
        });
        attemptLogger.debug(`Fetching supergraph`);
        return fetchSupergraphSdlFromManagedFederation({
          graphRef: graphosOpts.graphRef,
          apiKey: graphosOpts.apiKey,
          upLink: uplinkToUse,
          lastSeenId,
          fetch: transportContext.fetch || configContext.fetch,
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
        }).then(
          (result) => {
            if (result.minDelaySeconds) {
              attemptLogger.debug(
                `Setting min delay to ${result.minDelaySeconds}s`,
              );
              nextFetchTime = Date.now() + result.minDelaySeconds * 1000;
            }
            if ('error' in result) {
              attemptLogger.error(result.error.code, result.error.message);
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
            attemptLogger.error(err);
            if (retries > 0) {
              return fetchSupergraphWithDelay();
            }
            return lastSupergraphSdl;
          },
        );
      }
      return fetchSupergraphWithDelay();
    },
  };
}
