import { process } from '@graphql-mesh/cross-helpers';
import { millisecondsToStr } from '@graphql-mesh/fusion-runtime';
import { TransportContext } from '@graphql-mesh/transport-common';
import {
  DEFAULT_UPLINKS,
  fetchSupergraphSdlFromManagedFederation,
} from '@graphql-tools/federation';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import type {
  GatewayConfigContext,
  GatewayGraphOSManagedFederationOptions,
} from '../index';
import { delayInMs } from '../utils';

export interface CreateGraphOSFetcherOpts {
  graphosOpts: GatewayGraphOSManagedFederationOptions;
  configContext: GatewayConfigContext;
  pollingInterval: number | undefined;
}

const defaultLoadedPlacePrefix = 'GraphOS Managed Federation';

function decideMaxRetries({
  graphosOpts,
  pollingInterval,
  minDelaySeconds,
  uplinks,
  initialSchemaExists,
}: {
  graphosOpts: GatewayGraphOSManagedFederationOptions;
  pollingInterval: number | undefined;
  minDelaySeconds: number;
  uplinks: string[];
  initialSchemaExists: boolean;
}) {
  let maxRetries = graphosOpts.maxRetries || Math.max(3, uplinks.length);
  if (
    initialSchemaExists &&
    pollingInterval &&
    pollingInterval <= minDelaySeconds * 1000
  ) {
    maxRetries = 1;
  }
  return maxRetries;
}

export function createGraphOSFetcher({
  graphosOpts,
  configContext,
  pollingInterval,
}: CreateGraphOSFetcherOpts) {
  let lastSeenId: string;
  let lastSupergraphSdl: string;
  let nextFetchTime: number;
  const uplinksParam =
    graphosOpts.upLink || process.env['APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT'];
  const uplinks =
    uplinksParam?.split(',').map((uplink) => uplink.trim()) || DEFAULT_UPLINKS;
  const log = configContext.log.child('[apolloGraphOSSupergraphFetcher] ');
  log.info({ uplinks }, 'Using uplinks');
  let supergraphLoadedPlace = defaultLoadedPlacePrefix;
  if (graphosOpts.graphRef) {
    supergraphLoadedPlace += ` <br>${graphosOpts.graphRef}`;
  }
  let minDelaySeconds = 10;
  const uplinksToUse: string[] = [];
  return {
    supergraphLoadedPlace,
    unifiedGraphFetcher(transportContext: TransportContext) {
      const maxRetries = decideMaxRetries({
        graphosOpts,
        pollingInterval,
        minDelaySeconds,
        uplinks,
        initialSchemaExists: !!lastSupergraphSdl,
      });
      let retries = maxRetries;
      function fetchSupergraphWithDelay(): MaybePromise<string> {
        if (nextFetchTime) {
          const currentTime = Date.now();
          if (nextFetchTime >= currentTime) {
            const delay = nextFetchTime - currentTime;
            log.info(
              `Fetching supergraph with delay ${millisecondsToStr(delay)}`,
            );
            nextFetchTime = 0;
            return delayInMs(delay).then(fetchSupergraph);
          }
        }
        return fetchSupergraph();
      }
      function fetchSupergraph(): MaybePromise<string> {
        if (uplinksToUse.length === 0) {
          uplinksToUse.push(...uplinks);
        }
        retries--;
        const uplinkToUse = uplinksToUse.pop();
        const attemptMetadata: Record<string, number | string> = {
          uplink: uplinkToUse || 'none',
        };
        if (maxRetries > 1) {
          attemptMetadata['attempt'] = `${maxRetries - retries}/${maxRetries}`;
        }
        const attemptLogger = log.child(attemptMetadata);
        attemptLogger.debug('Fetching supergraph');
        return handleMaybePromise(
          () =>
            fetchSupergraphSdlFromManagedFederation({
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
            }),
          (result) => {
            if (result.minDelaySeconds) {
              minDelaySeconds = result.minDelaySeconds;
              attemptLogger.debug(`Setting min delay to ${minDelaySeconds}s`);
            }

            nextFetchTime = Date.now() + minDelaySeconds * 1000;

            if ('error' in result && result.error) {
              attemptLogger.error(result.error.code, result.error.message);
            }
            if ('id' in result) {
              if (lastSeenId === result.id) {
                attemptLogger.debug('Supergraph is unchanged');
                return lastSupergraphSdl;
              }
              lastSeenId = result.id;
            }
            if ('supergraphSdl' in result && result.supergraphSdl) {
              attemptLogger.debug(
                `Fetched the new supergraph ${lastSeenId ? `with id ${lastSeenId}` : ''}`,
              );
              lastSupergraphSdl = result.supergraphSdl;
            }
            if (!lastSupergraphSdl) {
              if (retries > 0) {
                return fetchSupergraphWithDelay();
              }
              throw new Error(
                `Failed to fetch supergraph SDL from '${uplinkToUse}': [${JSON.stringify(result)}]`,
              );
            }
            return lastSupergraphSdl;
          },
          (err: Error) => {
            nextFetchTime = Date.now() + minDelaySeconds * 1000;
            if (retries > 0) {
              attemptLogger.error(err);
              return fetchSupergraphWithDelay();
            }
            if (lastSupergraphSdl) {
              attemptLogger.error(err);
              return lastSupergraphSdl;
            }
            if (err?.name === 'TimeoutError') {
              throw new Error(`HTTP request to '${uplinkToUse}' timed out`);
            }
            throw err;
          },
        );
      }
      return fetchSupergraphWithDelay();
    },
  };
}
