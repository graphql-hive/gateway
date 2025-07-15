import type { MaybePromise } from '@whatwg-node/promise-helpers';
import type { ServerAdapterInitialContext } from '@whatwg-node/server';

export interface AWSSignv4PluginOptions {
  /**
   * Outgoing options for signing outgoing requests.
   */
  outgoing?:
    | AWSSignv4PluginOutgoingOptions
    | AWSSignv4PluginOutgoingOptionsFactory;
  /**
   * Incoming options for validating incoming requests.
   */
  incoming?: AWSSignv4PluginIncomingOptions | boolean;
}

export interface AWSSignv4PluginOutgoingOptions {
  /**
   * To sign the query instead of adding an Authorization header
   * @default false
   */
  signQuery?: boolean;
  /**
   * Service name to use when signing the request.
   * By default, it is inferred from the hostname.
   */
  serviceName?: string;
  /**
   * Region name to use when signing the request.
   * By default, it is inferred from the hostname.
   */
  region?: string;

  /**
   * ACCESS_KEY_ID
   * @default env.AWS_ACCESS_KEY_ID || env.AWS_ACCESS_KEY
   */
  accessKeyId?: string;
  /**
   * AWS_SECRET_ACCESS_KEY
   * @default env.AWS_SECRET_ACCESS_KEY || env.AWS_SECRET_KEY
   */
  secretAccessKey?: string;
  /**
   * AWS_SESSION_TOKEN
   * @default env.AWS_SESSION_TOKEN
   */
  sessionToken?: string;
  /**
   * An identifier for the assumed role session.
   *
   * @default env.AWS_ROLE_ARN
   */
  roleArn?: string;
  /**
   * The Amazon Resource Names (ARNs) of the IAM managed policies that you want to use as
   * managed session policies. The policies must exist in the same account as the role.
   *
   * @default env.AWS_IAM_ROLE_SESSION_NAME
   */
  roleSessionName?: string;
}

export interface AWSSignv4PluginOutgoingOptionsFactoryOptions {
  url: string;
  options: RequestInit;
  subgraphName: string;
}

export type AWSSignv4PluginOutgoingOptionsFactory = (
  factoryOptions: AWSSignv4PluginOutgoingOptionsFactoryOptions,
) => AWSSignv4PluginOutgoingOptions | undefined | false | true;

export interface AWSSignv4PluginIncomingPayload {
  /**
   * HTTP request
   */
  request: Request;
  /**
   * Context
   */
  serverContext: ServerAdapterInitialContext;
  /**
   * Incoming authorization headers string. Required.
   */
  authorization: string;
  /**
   * DateTime from incoming header. Required.
   */
  xAmzDate: string;
  /**
   * Additional header to set message exiration time even if signature message is valid. Optional.
   */
  xAmzExpires?: number;
  /**
   * Sha256 + formated hex for body. Empty body has own bodyHash. If there is no need to sign body for performance reason you can put UNSIGNED-PAYLOAD in request headers['x-amz-content-sha256'].
   */
  bodyHash: string;
  /**
   * accessKey used to sign this message.
   */
  accessKey: string;
  /**
   * Date used in authorization header.
   */
  date: string;
  /**
   * Region used in authorization header. Here can be any value.
   */
  region: string;
  /**
   * Service used in authorization header. Here can be any value.
   */
  service: string;
  /**
   * For aws4 will be aws4_request. Here can be any value.
   */
  requestType: string;
  /**
   * List of signed headers separated with semicolon.
   */
  signedHeaders: string;
  /**
   * Formated encoded header paris.
   */
  canonicalHeaders: string;

  secretAccessKey?: string;
}

export interface AssumeRolePayload {
  /**
   * Region name to use when signing the request.
   * By default, it is inferred from the hostname.
   */
  region?: string;
  /**
   * An identifier for the assumed role session.
   *
   * @default env.AWS_ROLE_ARN
   */
  roleArn?: string;
  /**
   * The Amazon Resource Names (ARNs) of the IAM managed policies that you want to use as
   * managed session policies. The policies must exist in the same account as the role.
   *
   * @default env.AWS_IAM_ROLE_SESSION_NAME
   */
  roleSessionName?: string;
}

export interface AWSSignv4PluginIncomingOptions {
  /**
   * Callback for secretKey. You have to provide process to get proper secret or return undefined secret.
   * By default it uses `accessKey` to get secret from `env.AWS_SECRET_ACCESS_KEY` or `env.AWS_SECRET_KEY`.
   * Should return secretKey on incoming parameters - but if secret is missing which it will be normal case when someone want to guess - you should return undefined;
   */
  secretAccessKey?: (
    payload: AWSSignv4PluginIncomingPayload,
  ) => MaybePromise<string | undefined> | string | undefined;
  /**
   * An identifier for the assumed role session.
   *
   * @default env.AWS_ROLE_ARN
   */
  assumeRole?: (
    payload: AWSSignv4PluginIncomingPayload,
  ) =>
    | MaybePromise<AssumeRolePayload | undefined>
    | AssumeRolePayload
    | undefined;
  /**
   * Callback for changes in incoming headers before it goes through parse process. Help to more sophisticated changes to preserve proper headers.
   */
  headers?: (headers: Headers) => Headers;
  /**
   * You can skip aws signature validation. It is useful when you want to use it only for some requests.
   */
  enabled?: (
    request: Request,
    serverContext: ServerAdapterInitialContext,
  ) => MaybePromise<boolean>;
  /**
       * Callback on header missing. Validation stops here. Default value `onMissingHeaders: () => {
              throw new GraphQLError('Headers are missing for auth', {
                extensions: {
                  http: {
                    status: 401,
                  }
                }
              });
            },`
       */
  onMissingHeaders?: (
    request: Request,
    serverContext: ServerAdapterInitialContext,
  ) => MaybePromise<void>;
  /**
       * Custom response on signature mismatch. Validation stops here. Default value `onSignatureMismatch: () => {
              throw new GraphQLError('The signature does not match', {
                extensions: {
                  http: {
                    status: 401,
                  }
                }
              });
            },`
       */
  onSignatureMismatch?: (
    request: Request,
    serverContext: ServerAdapterInitialContext,
  ) => MaybePromise<void>;
  /**
       * Custom response on exired time signature. Validation stops here. Default value `onExpired: () => {
              throw new GraphQLError('Request is expired', {
                extensions: {
                  http: {
                    status: 401,
                  }
                }
              });
            },`
       */
  onExpired?: (
    request: Request,
    serverContext: ServerAdapterInitialContext,
  ) => MaybePromise<void>;
  /**
   * Custom callback before standard parser comes. On false validation stops here. Default value `onBeforeParse: () => true,`
   *
   * Should return true if you need to let parse request further.
   */
  onBeforeParse?: (
    request: Request,
    serverContext: ServerAdapterInitialContext,
  ) => MaybePromise<boolean>;
  /**
   * Custom callback after standard parser done. On false validation stops here. Default value `onAfterParse: () => true,`
   * Should return true if you need to let parse request further.
   */
  onAfterParse?: (
    payload: AWSSignv4PluginIncomingPayload,
  ) => MaybePromise<boolean>;
  /**
   * Last callback after when validation signature is done. You can even stop here process.
   */
  onSuccess?: (payload: AWSSignv4PluginIncomingPayload) => MaybePromise<void>;
}
export enum AWSSignV4Headers {
  'Authorization' = 'authorization',
  'XAmzDate' = 'x-amz-date',
  'XAmzContentSha256' = 'x-amz-content-sha256',
  'XAmzExpires' = 'x-amz-expires',
}
