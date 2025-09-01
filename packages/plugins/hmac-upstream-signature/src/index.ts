import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { Logger } from '@graphql-hive/logger';
import type { OnSubgraphExecutePayload } from '@graphql-mesh/fusion-runtime';
import { serializeExecutionRequest } from '@graphql-tools/executor-common';
import type { ExecutionRequest } from '@graphql-tools/utils';
import {
  handleMaybePromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import type { FetchAPI, GraphQLParams } from 'graphql-yoga';
import jsonStableStringify from 'json-stable-stringify';

export type HMACUpstreamSignatureOptions = {
  secret: string;
  shouldSign?: (
    input: Pick<
      OnSubgraphExecutePayload<{}>,
      'subgraph' | 'subgraphName' | 'executionRequest'
    >,
  ) => boolean;
  extensionName?: string;
  serializeExecutionRequest?: (executionRequest: ExecutionRequest) => string;
};

const DEFAULT_EXTENSION_NAME = 'hmac-signature';
const DEFAULT_SHOULD_SIGN_FN: NonNullable<
  HMACUpstreamSignatureOptions['shouldSign']
> = () => true;

export const defaultExecutionRequestSerializer = (
  executionRequest: ExecutionRequest,
) =>
  jsonStableStringify(
    serializeExecutionRequest({
      executionRequest: {
        document: executionRequest.document,
        variables: executionRequest.variables,
      },
    }),
  );
export const defaultParamsSerializer = (params: GraphQLParams) =>
  jsonStableStringify({
    query: params.query,
    variables:
      params.variables != null && Object.keys(params.variables).length > 0
        ? params.variables
        : undefined,
  });

function createCryptoKey({
  textEncoder,
  crypto,
  secret,
  usages,
}: {
  textEncoder: TextEncoder;
  crypto: Crypto;
  secret: string;
  usages: KeyUsage[];
}): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

export function useHmacUpstreamSignature(
  options: HMACUpstreamSignatureOptions,
): GatewayPlugin {
  if (!options.secret) {
    throw new Error(
      'Property "secret" is required for useHmacUpstreamSignature plugin',
    );
  }

  const shouldSign = options.shouldSign || DEFAULT_SHOULD_SIGN_FN;
  const extensionName = options.extensionName || DEFAULT_EXTENSION_NAME;
  const serializeExecutionRequest =
    options.serializeExecutionRequest || defaultExecutionRequestSerializer;
  let key$: MaybePromise<CryptoKey>;
  let fetchAPI: FetchAPI;
  let textEncoder: TextEncoder;

  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onSubgraphExecute({
      subgraphName,
      subgraph,
      executionRequest,
      log: rootLog,
    }) {
      const log = rootLog.child('[useHmacUpstreamSignature] ');
      log.debug(`Running shouldSign for subgraph ${subgraphName}`);

      if (shouldSign({ subgraphName, subgraph, executionRequest })) {
        log.debug(
          `shouldSign is true for subgraph ${subgraphName}, signing request`,
        );
        textEncoder ||= new fetchAPI.TextEncoder();
        return handleMaybePromise(
          () =>
            (key$ ||= createCryptoKey({
              textEncoder,
              crypto: fetchAPI.crypto,
              secret: options.secret,
              usages: ['sign'],
            })),
          (key) => {
            key$ = key;
            const serializedExecutionRequest =
              serializeExecutionRequest(executionRequest);
            const encodedContent = textEncoder.encode(
              serializedExecutionRequest,
            );
            return handleMaybePromise(
              () => fetchAPI.crypto.subtle.sign('HMAC', key, encodedContent),
              (signature) => {
                const extensionValue = fetchAPI.btoa(
                  String.fromCharCode(...new Uint8Array(signature)),
                );
                log.debug(
                  {
                    signature: extensionValue,
                    payload: serializedExecutionRequest,
                  },
                  `Produced hmac signature for subgraph ${subgraphName}`,
                );

                if (!executionRequest.extensions) {
                  executionRequest.extensions = {};
                }
                executionRequest.extensions[extensionName] = extensionValue;
              },
            );
          },
        );
      } else {
        log.debug(
          `shouldSign is false for subgraph ${subgraphName}, skipping hmac signature`,
        );
      }
    },
  };
}

export type HMACUpstreamSignatureValidationOptions = {
  log: Logger;
  secret: string;
  extensionName?: string;
  serializeParams?: (params: GraphQLParams) => string;
};

export function useHmacSignatureValidation(
  options: HMACUpstreamSignatureValidationOptions,
): GatewayPlugin {
  if (!options.secret) {
    throw new Error(
      'Property "secret" is required for useHmacSignatureValidation plugin',
    );
  }

  const extensionName = options.extensionName || DEFAULT_EXTENSION_NAME;
  let key$: MaybePromise<CryptoKey>;
  let textEncoder: TextEncoder;
  const paramsSerializer = options.serializeParams || defaultParamsSerializer;

  return {
    onParams({ params, fetchAPI, context }) {
      // log will be missing from context if executing from Yoga (Yoga does not update serverContext)
      let log = context?.log ?? options.log;
      log = log.child('[useHmacSignatureValidation] ');
      textEncoder ||= new fetchAPI.TextEncoder();
      const extension = params.extensions?.[extensionName];

      if (!extension) {
        throw new Error(
          `Missing HMAC signature: extension ${extensionName} not found in request.`,
        );
      }

      return handleMaybePromise(
        () =>
          (key$ ||= createCryptoKey({
            textEncoder,
            crypto: fetchAPI.crypto,
            secret: options.secret,
            usages: ['verify'],
          })),
        (key) => {
          key$ = key;
          const sigBuf = Uint8Array.from(atob(extension), (c) =>
            c.charCodeAt(0),
          );
          const serializedParams = paramsSerializer(params);
          log.debug(
            { serializedParams },
            'HMAC signature will be calculate based on serialized params',
          );

          return handleMaybePromise(
            () =>
              fetchAPI.crypto.subtle.verify(
                'HMAC',
                key,
                sigBuf,
                textEncoder.encode(serializedParams),
              ),
            (result) => {
              if (!result) {
                log.error(
                  'HMAC signature does not match the body content. short circuit request.',
                );
                throw new Error(
                  `Invalid HMAC signature: extension ${extensionName} does not match the body content.`,
                );
              }
            },
          );
        },
      );
    },
  };
}
