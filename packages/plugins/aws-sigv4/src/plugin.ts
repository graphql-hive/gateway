import { BinaryLike, createHash, createHmac, KeyObject } from 'node:crypto';
import { STS } from '@aws-sdk/client-sts';
import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { getEnvStr } from '~internal/env';
import aws4, { type Request as AWS4Request } from 'aws4';
import { createGraphQLError } from 'graphql-yoga';
import {
  AWSSignV4Headers,
  AWSSignv4PluginIncomingOptions,
  AWSSignv4PluginIncomingPayload,
  AWSSignv4PluginOptions,
} from './types';

function isBufferOrString(body: unknown): body is Buffer | string {
  return typeof body === 'string' || globalThis.Buffer?.isBuffer(body);
}

const DEFAULT_INCOMING_OPTIONS: Required<AWSSignv4PluginIncomingOptions> = {
  enabled: () => true,
  headers: (headers) => headers,
  secretAccessKey: () =>
    getEnvStr('AWS_SECRET_ACCESS_KEY') || getEnvStr('AWS_SECRET_KEY'),
  assumeRole: () =>
    getEnvStr('AWS_ROLE_ARN') != null &&
    getEnvStr('AWS_IAM_ROLE_SESSION_NAME') != null
      ? {
          roleArn: getEnvStr('AWS_ROLE_ARN'),
          roleSessionName: getEnvStr('AWS_IAM_ROLE_SESSION_NAME'),
        }
      : undefined,
  onExpired() {
    throw createGraphQLError('Request is expired', {
      extensions: {
        http: {
          status: 401,
        },
        code: 'UNAUTHORIZED',
      },
    });
  },
  onMissingHeaders() {
    throw createGraphQLError('Required headers are missing', {
      extensions: {
        http: {
          status: 401,
        },
        code: 'UNAUTHORIZED',
      },
    });
  },
  onSignatureMismatch() {
    throw createGraphQLError('The signature does not match', {
      extensions: {
        http: {
          status: 401,
        },
        code: 'UNAUTHORIZED',
      },
    });
  },
  onBeforeParse: () => true,
  onAfterParse: () => true,
  onSuccess() {},
};

export function useAWSSigv4<TContext extends Record<string, any>>(
  opts: AWSSignv4PluginOptions,
): GatewayPlugin<TContext> {
  const outgoingOptionsFactory =
    typeof opts.outgoing === 'function'
      ? opts.outgoing
      : () => opts.outgoing || true;
  const incomingOptions: Required<AWSSignv4PluginIncomingOptions> | undefined =
    opts.incoming != null && opts.incoming !== false
      ? opts.incoming === true
        ? DEFAULT_INCOMING_OPTIONS
        : {
            ...DEFAULT_INCOMING_OPTIONS,
            secretAccessKey(payload) {
              const secretFromEnv =
                getEnvStr('AWS_SECRET_ACCESS_KEY') ||
                getEnvStr('AWS_SECRET_KEY');
              if (secretFromEnv) {
                return secretFromEnv;
              }
              return handleMaybePromise(
                () => incomingOptions?.assumeRole?.(payload),
                (assumeRolePayload) => {
                  if (
                    !assumeRolePayload ||
                    !assumeRolePayload.roleArn ||
                    !assumeRolePayload.roleSessionName
                  ) {
                    return;
                  }
                  const sts = new STS({ region: assumeRolePayload.region });
                  return handleMaybePromise(
                    () =>
                      sts.assumeRole({
                        RoleArn: assumeRolePayload.roleArn,
                        RoleSessionName: assumeRolePayload.roleSessionName,
                      }),
                    (stsResult) => stsResult?.Credentials?.SecretAccessKey,
                  );
                },
              );
            },
            ...opts.incoming,
          }
      : undefined;
  return {
    // Handle incoming requests
    onRequestParse({ request, serverContext, url }) {
      if (incomingOptions == null) {
        return;
      }
      return handleMaybePromise(
        () => incomingOptions.enabled(request, serverContext),
        (ifEnabled) => {
          if (!ifEnabled) {
            return;
          }
          return handleMaybePromise(
            () => {
              if (!incomingOptions) {
                throw new Error('Missing options setup');
              }
              return handleMaybePromise(
                () => incomingOptions.onBeforeParse(request, serverContext),
                (ifContinue) => {
                  if (!ifContinue) {
                    return;
                  }
                  const authorization = request.headers.get(
                    AWSSignV4Headers.Authorization,
                  );
                  const xAmzDate = request.headers.get(
                    AWSSignV4Headers.XAmzDate,
                  );
                  const xAmzExpires = Number(
                    request.headers.get(AWSSignV4Headers.XAmzExpires),
                  );
                  const contentSha256 = request.headers.get(
                    AWSSignV4Headers.XAmzContentSha256,
                  );
                  const bodyHash = contentSha256;
                  // Check if the required headers are present
                  if (!authorization || !xAmzDate) {
                    return incomingOptions.onMissingHeaders?.(
                      request,
                      serverContext,
                    );
                  }
                  // Expires? use xAmzExpires [seconds] to calculate
                  // if xAmzExpires not set will be ignored.
                  let expired: boolean;
                  if (!xAmzExpires) {
                    expired = false;
                  } else {
                    const stringISO8601 = xAmzDate.replace(
                      /^(.{4})(.{2})(.{2})T(.{2})(.{2})(.{2})Z$/,
                      '$1-$2-$3T$4:$5:$6Z',
                    );
                    const localDateTime = new Date(stringISO8601);
                    localDateTime.setSeconds(
                      localDateTime.getSeconds(),
                      xAmzExpires,
                    );

                    expired = localDateTime < new Date();
                  }
                  if (expired) {
                    return incomingOptions.onExpired?.(request, serverContext);
                  }

                  // Extract the necessary information from the authorization header
                  const [
                    ,
                    credentialRaw = '',
                    signedHeadersRaw = '',
                    _signatureRaw,
                  ] = authorization.split(/\s+/);
                  const credential = /=([^,]*)/.exec(credentialRaw)?.[1] ?? ''; // credential.split('=');
                  const signedHeaders =
                    /=([^,]*)/.exec(signedHeadersRaw)?.[1] ?? '';
                  const [accessKey, date, region, service, requestType] =
                    credential.split('/');
                  const incomingHeaders = incomingOptions.headers(
                    request.headers,
                  );
                  const canonicalHeaders = signedHeaders
                    .split(';')
                    .map(
                      (key) =>
                        key.toLowerCase() +
                        ':' +
                        trimAll(incomingHeaders.get(key)),
                    )
                    .join('\n');
                  if (
                    !accessKey ||
                    !bodyHash ||
                    !canonicalHeaders ||
                    !date ||
                    !request.method ||
                    !url.pathname ||
                    !region ||
                    !requestType ||
                    !service ||
                    !signedHeaders ||
                    !xAmzDate
                  ) {
                    return incomingOptions.onSignatureMismatch?.(
                      request,
                      serverContext,
                    );
                  }
                  const payload: AWSSignv4PluginIncomingPayload = {
                    accessKey,
                    authorization,
                    bodyHash,
                    canonicalHeaders,
                    date,
                    region,
                    requestType,
                    service,
                    signedHeaders,
                    xAmzDate,
                    xAmzExpires,
                    request,
                    serverContext,
                  };

                  return handleMaybePromise(
                    () => incomingOptions.secretAccessKey?.(payload),
                    (secretKey) => {
                      if (!secretKey) {
                        return incomingOptions.onSignatureMismatch?.(
                          request,
                          serverContext,
                        );
                      }
                      payload.secretAccessKey = secretKey;
                      return handleMaybePromise(
                        () => incomingOptions.onAfterParse(payload),
                        (shouldContinue) => {
                          if (!shouldContinue) {
                            return;
                          }
                          return payload;
                        },
                      );
                    },
                  );
                },
              );
            },
            (payload: AWSSignv4PluginIncomingPayload | false | void) => {
              if (!payload) {
                return;
              }
              const credentialString = [
                payload?.date,
                payload?.region,
                payload?.service,
                payload?.requestType,
              ].join('/');

              const hmacDate = hmac(
                'AWS4' + payload.secretAccessKey,
                payload.date,
              );
              const hmacRegion = hmac(hmacDate, payload.region);
              const hmacService = hmac(hmacRegion, payload.service);
              const hmacCredentials = hmac(hmacService, 'aws4_request');

              let canonicalURI = url.pathname;
              if (canonicalURI !== '/') {
                canonicalURI = canonicalURI.replace(/\/{2,}/g, '/');
                canonicalURI = canonicalURI
                  .split('/')
                  .reduce((_path: string[], piece) => {
                    if (piece === '..') {
                      _path.pop();
                    } else if (piece !== '.') {
                      _path.push(encodeRfc3986Full(piece));
                    }
                    return _path;
                  }, [])
                  .join('/');
                if (canonicalURI[0] !== '/') {
                  canonicalURI = '/' + canonicalURI;
                }
              }

              const reducedQuery: Record<string, string> = {};
              url.searchParams.forEach((value, key) => {
                reducedQuery[encodeRfc3986Full(key)] = value;
              });
              const encodedQueryPieces: string[] = [];
              Object.keys(reducedQuery)
                .sort()
                .forEach((key) => {
                  if (!Array.isArray(reducedQuery[key])) {
                    encodedQueryPieces.push(
                      key +
                        '=' +
                        encodeRfc3986Full((reducedQuery[key] as string) ?? ''),
                    );
                  } else {
                    (reducedQuery[key] as string[])
                      ?.map(encodeRfc3986Full)
                      ?.sort()
                      ?.forEach((val: string) => {
                        encodedQueryPieces.push(key + '=' + val);
                      });
                  }
                });
              const canonicalQueryString = encodedQueryPieces.join('&');

              const canonicalString = [
                request.method,
                canonicalURI,
                canonicalQueryString,
                payload.canonicalHeaders + '\n',
                payload.signedHeaders,
                payload.bodyHash,
              ].join('\n');

              const stringToSign = [
                'AWS4-HMAC-SHA256',
                payload.xAmzDate,
                credentialString,
                hash(canonicalString),
              ].join('\n');
              const signature = hmacHex(hmacCredentials, stringToSign);
              const calculatedAuthorization = [
                'AWS4-HMAC-SHA256 Credential=' +
                  payload.accessKey +
                  '/' +
                  credentialString,
                'SignedHeaders=' + payload.signedHeaders,
                'Signature=' + signature,
              ].join(', ');
              if (calculatedAuthorization !== payload?.authorization) {
                return incomingOptions.onSignatureMismatch?.(
                  request,
                  serverContext,
                );
              }
              return incomingOptions.onSuccess?.(payload);
            },
          );
        },
      );
    },
    // Handle outgoing requests
    onFetch({ url, options, setURL, setOptions, executionRequest }) {
      const subgraphName = (executionRequest &&
        subgraphNameByExecutionRequest.get(executionRequest))!;
      if (!isBufferOrString(options.body)) {
        return;
      }
      const factoryResult = outgoingOptionsFactory({
        url,
        options,
        subgraphName,
      });
      if (factoryResult === false) {
        return;
      }
      let signQuery = false;
      let accessKeyId: string | undefined =
        getEnvStr('AWS_ACCESS_KEY_ID') || getEnvStr('AWS_ACCESS_KEY');
      let secretAccessKey: string | undefined =
        getEnvStr('AWS_SECRET_ACCESS_KEY') || getEnvStr('AWS_SECRET_KEY');
      let sessionToken: string | undefined = getEnvStr('AWS_SESSION_TOKEN');
      let service: string | undefined;
      let region: string | undefined;
      let roleArn: string | undefined = getEnvStr('AWS_ROLE_ARN');
      let roleSessionName: string | undefined = getEnvStr(
        'AWS_IAM_ROLE_SESSION_NAME',
      );
      if (typeof factoryResult === 'object' && factoryResult != null) {
        signQuery = factoryResult.signQuery || false;
        accessKeyId =
          factoryResult.accessKeyId ||
          getEnvStr('AWS_ACCESS_KEY_ID') ||
          getEnvStr('AWS_ACCESS_KEY');
        secretAccessKey =
          factoryResult.secretAccessKey ||
          getEnvStr('AWS_SECRET_ACCESS_KEY') ||
          getEnvStr('AWS_SECRET_KEY');
        sessionToken =
          factoryResult.sessionToken || getEnvStr('AWS_SESSION_TOKEN');
        roleArn = factoryResult.roleArn;
        roleSessionName =
          factoryResult.roleSessionName ||
          getEnvStr('AWS_IAM_ROLE_SESSION_NAME');
        service = factoryResult.serviceName;
        region = factoryResult.region;
      }
      return handleMaybePromise(
        () =>
          roleArn && roleSessionName
            ? new STS({ region }).assumeRole({
                RoleArn: roleArn,
                RoleSessionName: roleSessionName,
              })
            : undefined,
        (stsResult) => {
          accessKeyId = stsResult?.Credentials?.AccessKeyId || accessKeyId;
          secretAccessKey =
            stsResult?.Credentials?.SecretAccessKey || secretAccessKey;
          sessionToken = stsResult?.Credentials?.SessionToken || sessionToken;
          const parsedUrl = new URL(url);
          const aws4Request: AWS4Request = {
            host: parsedUrl.host,
            method: options.method,
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            body: options.body as Buffer,
            headers: options.headers,
            signQuery,
            service,
            region,
          };
          const modifiedAws4Request = aws4.sign(aws4Request, {
            accessKeyId,
            secretAccessKey,
            sessionToken,
          });
          setURL(
            `${parsedUrl.protocol}//${modifiedAws4Request.host}${modifiedAws4Request.path}`,
          );
          setOptions({
            ...options,
            method: modifiedAws4Request.method,
            headers: modifiedAws4Request.headers as Record<string, string>,
            body: modifiedAws4Request.body,
          });
        },
      );
    },
  };
}

const trimAll = (header: string | string[] | undefined | null) =>
  header?.toString().trim().replace(/\s+/g, ' ');
const encodeRfc3986Full = (str: string) =>
  encodeRfc3986(encodeURIComponent(str));
const encodeRfc3986 = (urlEncodedString: string) =>
  urlEncodedString.replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
const hmac = (secretKey: BinaryLike | KeyObject, data: string) =>
  createHmac('sha256', secretKey).update(data, 'utf8').digest();
const hash = (data: string) =>
  createHash('sha256').update(data, 'utf8').digest('hex');
const hmacHex = (secretKey: BinaryLike | KeyObject, data: string) =>
  createHmac('sha256', secretKey).update(data, 'utf8').digest('hex');
