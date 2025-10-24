import type { Plugin as EnvelopPlugin } from '@envelop/core';
import type { GenericAuthPluginOptions } from '@envelop/generic-auth';
import type { Logger, LogLevel } from '@graphql-hive/logger';
import type { PubSub } from '@graphql-hive/pubsub';
import type {
  BatchDelegateOptions,
  Instrumentation as GatewayRuntimeInstrumentation,
  TransportEntryAdditions,
  Transports,
  UnifiedGraphPlugin,
} from '@graphql-mesh/fusion-runtime';
import type { HMACUpstreamSignatureOptions } from '@graphql-mesh/hmac-upstream-signature';
import type { ResponseCacheConfig } from '@graphql-mesh/plugin-response-cache';
import type {
  KeyValueCache,
  Logger as LegacyLogger,
  MeshFetch,
  MeshFetchRequestInit,
} from '@graphql-mesh/types';
import type { FetchInstrumentation } from '@graphql-mesh/utils';
import type { HTTPExecutorOptions } from '@graphql-tools/executor-http';
import type {
  ExecutionRequest,
  IResolvers,
  MaybePromise,
  TypeSource,
  ValidationRule,
} from '@graphql-tools/utils';
import type { CSRFPreventionPluginOptions } from '@graphql-yoga/plugin-csrf-prevention';
import type { UsePersistedOperationsOptions } from '@graphql-yoga/plugin-persisted-operations';
import type { DocumentNode, GraphQLSchema, TypeInfo } from 'graphql';
import type {
  BatchingOptions,
  FetchAPI,
  YogaInitialContext,
  Instrumentation as YogaInstrumentation,
  YogaMaskedErrorOpts,
  Plugin as YogaPlugin,
  YogaServerOptions,
} from 'graphql-yoga';
import { GraphQLResolveInfo } from 'graphql/type';
import type { UnifiedGraphConfig } from './handleUnifiedGraphConfig';
import type { UseContentEncodingOpts } from './plugins/useContentEncoding';
import type { AgentFactory } from './plugins/useCustomAgent';
import { DemandControlPluginOptions } from './plugins/useDemandControl';
import { HiveConsolePluginOptions } from './plugins/useHiveConsole';
import { PropagateHeadersOpts } from './plugins/usePropagateHeaders';
import { RequestIdOptions } from './plugins/useRequestId';
import { SubgraphErrorPluginOptions } from './plugins/useSubgraphErrorPlugin';
import { UpstreamRetryPluginOptions } from './plugins/useUpstreamRetry';
import { UpstreamTimeoutPluginOptions } from './plugins/useUpstreamTimeout';

export type { TransportEntryAdditions, UnifiedGraphConfig };

export type GatewayConfig<
  TContext extends Record<string, any> = Record<string, any>,
> =
  | GatewayConfigSupergraph<TContext>
  | GatewayConfigSubgraph<TContext>
  | GatewayConfigProxy<TContext>;

export interface GatewayConfigContext {
  /**
   * WHATWG compatible Fetch implementation.
   */
  fetch: MeshFetch;
  /**
   * The logger to use throught Hive and its plugins.
   */
  log: Logger;
  /**
   * Current working directory.
   * Note that working directory does not exist in serverless environments and will therefore be empty.
   */
  cwd: string;
  /**
   * Event bus for pub/sub.
   */
  pubsub?: PubSub;
  /**
   * Cache Storage
   */
  cache?: KeyValueCache;
}

export interface GatewayContext
  extends GatewayConfigContext,
    YogaInitialContext {
  /**
   * Environment agnostic HTTP headers provided with the request.
   */
  headers: Record<string, string>;
  /**
   * Runtime context available within WebSocket connections.
   */
  connectionParams?: Record<string, string>;
}

export type GatewayPlugin<
  TPluginContext extends Record<string, any> = Record<string, any>,
  TContext extends Record<string, any> = Record<string, any>,
> = YogaPlugin<
  Partial<TPluginContext> & GatewayContext & TContext,
  GatewayConfigContext
> &
  UnifiedGraphPlugin<Partial<TPluginContext> & GatewayContext & TContext> & {
    onFetch?: OnFetchHook<Partial<TPluginContext> & TContext>;
    onCacheGet?: OnCacheGetHook;
    onCacheSet?: OnCacheSetHook;
    onCacheDelete?: OnCacheDeleteHook;
    /**
     * An Instrumentation instance that will wrap each phases of the request pipeline.
     * This should be used primarily as an observability tool (for monitoring, tracing, etc...).
     *
     * Note: The wrapped functions in instrumentation should always be called. Use hooks to
     *       conditionally skip a phase.
     */
    instrumentation?: Instrumentation<
      TPluginContext & TContext & GatewayContext
    >;
  };

export interface OnFetchHookPayload<TContext> {
  url: string;
  setURL(url: URL | string): void;
  options: MeshFetchRequestInit;
  setOptions(options: MeshFetchRequestInit): void;
  /**
   * The context is not available in cases where "fetch" is done in
   * order to pull a supergraph or do some internal work.
   *
   * The logger will be available in all cases.
   */
  context: (GatewayContext & TContext) | { log: Logger };
  /** @deprecated Please use `log` from the {@link context} instead. */
  logger: LegacyLogger;
  info: GraphQLResolveInfo;
  fetchFn: MeshFetch;
  setFetchFn: (fetchFn: MeshFetch) => void;
  executionRequest?: ExecutionRequest;
  endResponse: (response$: MaybePromise<Response>) => void;
}

export interface OnFetchHookDonePayload {
  response: Response;
  setResponse: (response: Response) => void;
}

export type OnFetchHookDone = (
  payload: OnFetchHookDonePayload,
) => MaybePromise<void>;

export type OnFetchHook<TContext> = (
  payload: OnFetchHookPayload<TContext>,
) => MaybePromise<void | OnFetchHookDone>;

export type OnCacheGetHook = (
  payload: OnCacheGetHookEventPayload,
) => MaybePromise<OnCacheGetHookResult | void>;

export interface OnCacheGetHookEventPayload {
  cache: KeyValueCache;
  key: string;
  ttl?: number;
}

export interface OnCacheGetHookResult {
  onCacheHit?: OnCacheHitHook;
  onCacheMiss?: OnCacheMissHook;
  onCacheGetError?: OnCacheErrorHook;
}

export type OnCacheErrorHook = (payload: OnCacheErrorHookPayload) => void;

export interface OnCacheErrorHookPayload {
  error: Error;
}

export type OnCacheHitHook = (payload: OnCacheHitHookEventPayload) => void;
export interface OnCacheHitHookEventPayload {
  value: any;
}
export type OnCacheMissHook = () => void;

export type OnCacheSetHook = (
  payload: OnCacheSetHookEventPayload,
) => MaybePromise<OnCacheSetHookResult | void>;

export interface OnCacheSetHookResult {
  onCacheSetDone?: () => void;
  onCacheSetError?: OnCacheErrorHook;
}

export interface OnCacheSetHookEventPayload {
  cache: KeyValueCache;
  key: string;
  value: any;
  ttl?: number;
}

export type OnCacheDeleteHook = (
  payload: OnCacheDeleteHookEventPayload,
) => MaybePromise<OnCacheDeleteHookResult | void>;

export interface OnCacheDeleteHookResult {
  onCacheDeleteDone?: () => void;
  onCacheDeleteError?: OnCacheErrorHook;
}

export interface OnCacheDeleteHookEventPayload {
  cache: KeyValueCache;
  key: string;
}

export type Instrumentation<TContext extends Record<string, any>> =
  YogaInstrumentation<TContext> &
    GatewayRuntimeInstrumentation &
    FetchInstrumentation;

export interface GatewayConfigSupergraph<
  TContext extends Record<string, any> = Record<string, any>,
> extends GatewayConfigSchemaBase<TContext> {
  /**
   * SDL, path or an URL to the Federation Supergraph schema.
   *
   * Alternatively, CDN options for pulling a remote Federation Supergraph.
   */
  supergraph:
    | UnifiedGraphConfig
    | GatewayHiveCDNOptions
    | GatewayGraphOSManagedFederationOptions;
  /**
   * GraphQL schema polling interval in milliseconds when the {@link supergraph} is an URL.
   *
   * If {@link cache} is provided, the fetched {@link supergraph} will be cached setting the TTL to this interval in seconds.
   */
  pollingInterval?: number;
}

export interface GatewayConfigSubgraph<
  TContext extends Record<string, any> = Record<string, any>,
> extends GatewayConfigSchemaBase<TContext> {
  /**
   * SDL, path or an URL to the Federation Subgraph schema.
   */
  subgraph: UnifiedGraphConfig;
}

export interface GatewayConfigSchemaBase<TContext extends Record<string, any>>
  extends GatewayConfigBase<TContext> {
  /**
   * Additional GraphQL schema type definitions.
   */
  additionalTypeDefs?: TypeSource;
  /**
   * Additional GraphQL schema resolvers.
   */
  additionalResolvers?:
    | (
        | IResolvers<unknown, GatewayContext & TContext>
        | IResolvers<unknown, GatewayContext>
      )
    | (
        | IResolvers<unknown, GatewayContext & TContext>
        | IResolvers<unknown, GatewayContext>
      )[];
}

export interface GatewayConfigProxy<
  TContext extends Record<string, any> = Record<string, any>,
> extends GatewayConfigBase<TContext> {
  /**
   * HTTP executor to proxy all incoming requests to another HTTP endpoint.
   */
  proxy: HTTPExecutorOptions & { endpoint: string };
  /**
   * SDL, path or an URL to the GraphQL schema.
   *
   * Alternatively, CDN options for pulling a remote GraphQL schema.
   */
  schema?: GraphQLSchema | DocumentNode | string | GatewayHiveCDNOptions;
  /**
   * GraphQL schema polling interval in milliseconds.
   */
  pollingInterval?: number;
  /**
   * Disable GraphQL validation on the gateway
   *
   * By default, the gateway will validate the query against the schema before sending it to the executor.
   * This is recommended to be enabled, but can be disabled for performance reasons.
   *
   * @default false
   */
  skipValidation?: boolean;
}

export interface GatewayHiveCDNOptions {
  type: 'hive';
  /**
   * GraphQL Hive CDN endpoint URL.
   */
  endpoint: string;
  /**
   * GraphQL Hive CDN access key.
   */
  key: string;
}

export interface GatewayHiveReportingOptions
  extends Omit<
    HiveConsolePluginOptions,
    // we omit this property because we define persisted documents in GatewayHivePersistedDocumentsOptions
    'experimental__persistedDocuments'
  > {
  type: 'hive';
  /** GraphQL Hive registry access token. */
  token: string;
  /** The target to which the usage data should be reported to. */
  target?: string;
}

export interface GatewayGraphOSOptions {
  type: 'graphos';
  /**
   * The graph ref of the managed federation graph.
   * It is composed of the graph ID and the variant (`<YOUR_GRAPH_ID>@<VARIANT>`).
   *
   * You can find a a graph's ref at the top of its Schema Reference page in Apollo Studio.
   */
  graphRef: string;
  /**
   * The API key to use to authenticate with the managed federation up link.
   * It needs at least the `service:read` permission.
   *
   * [Learn how to create an API key](https://www.apollographql.com/docs/federation/v1/managed-federation/setup#4-connect-the-gateway-to-studio)
   */
  apiKey: string;
}

export interface GatewayGraphOSManagedFederationOptions
  extends GatewayGraphOSOptions {
  /**
   * Maximum number of retries to attempt when fetching the schema from the managed federation up link.
   */
  maxRetries?: number;
  /**
   * Minimum delay in seconds
   */
  minDelaySeconds?: number;
  /**
   * Delay of seconds on retries
   */
  retryDelaySeconds?: number;
  /**
   * The URL of the managed federation up link. When retrying after a failure, you should cycle through the default up links using this option.
   *
   * Uplinks are available in `DEFAULT_UPLINKS` constant.
   *
   * This options can also be defined using the `APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT` environment variable.
   * It should be a comma separated list of up links, but only the first one will be used.
   *
   * Default: 'https://uplink.api.apollographql.com/' (Apollo's managed federation up link on GCP)
   *
   * Alternative: 'https://aws.uplink.api.apollographql.com/' (Apollo's managed federation up link on AWS)
   */
  upLink?: string;
  /**
   * Agent Version to report to the usage reporting API
   *
   * @default "hive-gateway@VERSION_OF_GW"
   */
  agentVersion?: string;
  /**
   * Client name to report to the usage reporting API
   *
   * @default incoming `apollo-graphql-client-name` HTTP header
   */
  clientName?(req: Request): MaybePromise<string>;
  /**
   * Client version to report to the usage reporting API
   *
   * @default incoming `apollo-graphql-client-version` HTTP header
   */
  clientVersion?(req: Request): MaybePromise<string>;
}

export interface GatewayGraphOSReportingOptions extends GatewayGraphOSOptions {
  /**
   * Usage report endpoint
   *
   * Defaults to GraphOS endpoint (https://usage-reporting.api.apollographql.com/api/ingress/traces)
   */
  endpoint?: string;
}

/**
 * Use Hive's CDN for persisted documents.
 *
 * [See more.](https://the-guild.dev/graphql/hive/docs/features/app-deployments#persisted-documents-on-graphql-server-and-gateway)
 * */
export interface GatewayHivePersistedDocumentsOptions {
  type: 'hive';
  /**
   * GraphQL Hive persisted documents CDN endpoint URL.
   */
  endpoint: string;
  /**
   * GraphQL Hive persisted documents CDN access token.
   */
  token: string;
  /**
   * Whether arbitrary documents should be allowed along-side persisted documents.
   *
   * Alternatively, you can provide a function that returns a boolean value based on
   * the request's headers.
   *
   * @default false
   */
  allowArbitraryDocuments?:
    | boolean
    // @graphql-hive/core/client#AllowArbitraryDocumentsFunction which uses yoga's allowArbitraryOperations(request: Request)
    | ((request: Request) => MaybePromise<boolean>);
  /**
   * Whether arbitrary documents should be allowed along-side persisted documents.
   *
   * Alternatively, you can provide a function that returns a boolean value based on
   * the request's headers.
   *
   * @default false
   *
   * @deprecated This option is deprecated and will be removed in the next major version. Use `allowArbitraryDocuments` instead.
   */
  allowArbitraryOperations?:
    | boolean
    | ((request: Request) => MaybePromise<boolean>);
}

interface GatewayConfigBase<TContext extends Record<string, any>> {
  /** Usage reporting options. */
  reporting?: GatewayHiveReportingOptions | GatewayGraphOSReportingOptions;
  /** Persisted documents options. */
  persistedDocuments?:
    | GatewayHivePersistedDocumentsOptions
    | (Omit<
        UsePersistedOperationsOptions<GatewayContext>,
        'allowArbitraryOperations'
      > & {
        /**
         * Whether arbitrary documents should be allowed along-side persisted documents.
         *
         * Alternatively, you can provide a function that returns a boolean value based on
         * the request's headers.
         *
         * @default false
         */
        allowArbitraryDocuments?:
          | boolean
          // @graphql-hive/core/client#AllowArbitraryDocumentsFunction which uses yoga's allowArbitraryOperations(request: Request)
          | ((request: Request) => MaybePromise<boolean>);
        /**
         * Whether arbitrary documents should be allowed along-side persisted documents.
         *
         * Alternatively, you can provide a function that returns a boolean value based on
         * the request's headers.
         *
         * @default false
         *
         * @deprecated This option is deprecated and will be removed in the next major version. Use `allowArbitraryDocuments` instead.
         */
        allowArbitraryOperations?:
          | boolean
          | ((request: Request) => MaybePromise<boolean>);
      });
  /**
   * A map, or factory function, of transport kinds to their implementations.
   *
   * @example Providing a module exporting a transport.
   *
   * ```ts
   * import { defineConfig } from '@graphql-hive/gateway';
   *
   * export const gatewayConfig = defineConfig({
   *   transports: {
   *     http: import('@graphql-mesh/transport-http'),
   *   },
   * });
   * ```
   */
  transports?: Transports;
  /**
   * Configure Transport options for each subgraph.
   *
   * @example Adding subscriptions support for Federation v2 subgraphs.
   *
   * ```ts
   * import { defineConfig } from '@graphql-hive/gateway';
   *
   * export const gatewayConfig = defineConfig({
   *   transportEntries: {
   *     '*.http': { // all subgraphs that use the "http" transport kind
   *       options: {
   *         subscriptions: {
   *           ws: {
   *             endpoint: '/subscriptions',
   *           },
   *         },
   *       },
   *     },
   *   },
   * });
   * ```
   */
  transportEntries?: TransportEntryAdditions;
  /**
   * Gateway plugins that are compatible with GraphQL Yoga, envelop and Mesh.
   */
  plugins?(context: GatewayConfigContext): (
    | EnvelopPlugin
    | EnvelopPlugin<GatewayContext>
    | EnvelopPlugin<GatewayContext & TContext>
    //
    | YogaPlugin
    | YogaPlugin<GatewayContext>
    | YogaPlugin<GatewayContext & TContext>
    //
    | GatewayPlugin
    | GatewayPlugin<any, GatewayContext>
    | GatewayPlugin<any, GatewayContext & TContext>
  )[];
  /**
   * Enable, disable or configure CORS.
   */
  cors?: YogaServerOptions<unknown, GatewayContext & TContext>['cors'];
  /**
   * Show, hide or configure GraphiQL.
   */
  graphiql?: YogaServerOptions<unknown, GatewayContext & TContext>['graphiql'];
  /**
   * Accepts a factory function that returns GraphiQL HTML, this replaces the existing GraphiQL
   * So this option can be also used to provide an offline GraphiQL
   * @see https://the-guild.dev/graphql/yoga-server/docs/features/graphiql#offline-usage
   */
  renderGraphiQL?: YogaServerOptions<
    unknown,
    GatewayContext & TContext
  >['renderGraphiQL'];
  /**
   * Whether the landing page should be shown.
   */
  landingPage?: boolean;
  /**
   * Enable and define a limit for [Request Batching](https://github.com/graphql/graphql-over-http/blob/main/rfcs/Batching.md).
   */
  batching?: BatchingOptions;
  /**
   * WHATWG compatible Fetch implementation.
   *
   * If you want to change the fetch function implementation, use `useCustomFetch` plugin.
   * But we do not recommend changing the fetch implementation unless you know what you are doing.
   *
   * @warning Do not use this option unless you know what you are doing.
   */
  fetchAPI?: Partial<
    Omit<FetchAPI, 'fetch'> & {
      fetch?: MeshFetch;
    }
  >;
  /**
   * Enable, disable or implement a custom logger for logging.
   *
   * @default true
   *
   * @see https://the-guild.dev/graphql/hive/docs/gateway/logging-and-error-handling
   */
  logging?: boolean | Logger | LogLevel | undefined;
  /**
   * Endpoint of the GraphQL API.
   */
  graphqlEndpoint?: string;
  /**
   * Configure error masking for more control over the exposed errors.
   *
   * Throwing `EnvelopError` or `GraphQLError`s within your GraphQL resolvers exposes the full error to the client through a well-formatted GraphQL response.
   *
   * @see https://the-guild.dev/graphql/yoga-server/docs/features/error-masking
   *
   * @default true
   */
  maskedErrors?: boolean | Partial<YogaMaskedErrorOpts>;
  /**
   * Cache storage interface for various operations that can get cached.
   *
   * For example, the fetched {@link supergraph} will be cached setting the TTL to the provided polling interval in seconds when it's behind and URL.
   */
  cache?: KeyValueCache;
  pubsub?: PubSub;
  /**
   * Health check endpoint
   */
  healthCheckEndpoint?: string;
  /**
   * Readiness check endpoint
   */
  readinessCheckEndpoint?: string;
  /**
   * Working directory to run Hive Gateway with.
   */
  cwd?: string;

  // Product Options

  /**
   * The name of the product.
   *
   * @default 'GraphQL Mesh'
   */
  productName?: string;

  /**
   * The description of the product.
   *
   * @default 'serve GraphQL federated architecture for any API service(s)'
   */
  productDescription?: string;

  /**
   * The name of the package.
   *
   * @default '@graphql-hive/gateway'
   */
  productPackageName?: string;

  /**
   * The logo of the product.
   */
  productLogo?: string;

  /**
   * The link to the product website
   */
  productLink?: string;

  // Builtin plugins

  /**
   * Enable response caching
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/performance/response-caching)
   */
  responseCaching?: Omit<ResponseCacheConfig, keyof GatewayConfigContext>;

  /**
   * Enable compression and decompression of HTTP requests and responses
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/performance/compression)
   */
  contentEncoding?: boolean | UseContentEncodingOpts;

  /**
   * Enable `@defer` and `@stream` support
   *
   * @experimental This feature is experimental and may change in the future.
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/defer-stream)
   */
  deferStream?: boolean;

  /**
   * GraphQL Multipart Request support.
   *
   * @see https://github.com/jaydenseric/graphql-multipart-request-spec
   *
   * @default false
   */
  multipart?: boolean;

  /**
   * Enable execution cancellation
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/performance/execution-cancellation)
   */
  executionCancellation?: boolean;

  /**
   * Enable upstream cancellation
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/performance/upstream-cancellation)
   */
  upstreamCancellation?: boolean;

  /**
   * Disable introspection
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/security/disable-introspection)
   *
   * @default false
   */
  disableIntrospection?: DisableIntrospectionOptions<TContext>;

  /**
   * CSRF Prevention
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/security/csrf-prevention)
   */
  csrfPrevention?: CSRFPreventionPluginOptions;

  /**
   * Providing a custom HTTP(S) Agent to manipulate the HTTP(S) requests.
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/security/https)
   */
  customAgent?: AgentFactory<GatewayContext & Partial<TContext>>;

  /**
   * Generic Auth Configuration
   */
  genericAuth?: GenericAuthPluginOptions<
    Record<string, any>, // convenient for strict tsconfig environment
    GatewayContext & Partial<TContext>
  >;

  /**
   * HMAC Signature Handling
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/security/hmac-signature)
   */
  hmacSignature?: HMACUpstreamSignatureOptions;

  /**
   * Enable WebHooks handling
   */
  webhooks?: boolean;

  /**
   * Header Propagation
   */
  propagateHeaders?: PropagateHeadersOpts<TContext>;

  /**
   * Upstream Timeout
   *
   * Configure the timeout for upstream requests.
   */
  upstreamTimeout?: UpstreamTimeoutPluginOptions;

  /**
   * Upstream Request Retry
   *
   * Configure the retry for upstream requests.
   */
  upstreamRetry?: UpstreamRetryPluginOptions;

  /**
   * Configure the request ID for the gateway
   *
   * @default true
   */
  requestId?: boolean | RequestIdOptions<Partial<TContext>>;

  /**
   * Demand Control
   *
   * Configure the demand control for upstream requests.
   */
  demandControl?: DemandControlPluginOptions;

  /**
   * Enable/disable batching the requests to the subgraphs
   *
   * Do not use it unless you know what you are doing.
   *
   * @experimental
   */
  __experimental__batchExecution?: boolean;

  /**
   * Configure the delegation batching options for all types on all subgraphs
   *
   * Do not use it unless you know what you are doing!
   *
   * @experimental
   */
  __experimental__batchDelegateOptions?: BatchDelegateOptions;

  /**
   * Subgraph error handling
   */
  subgraphErrors?: SubgraphErrorPluginOptions | false;

  /**
   * Process cookie headers
   *
   * Now [`request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object in the GraphQL Context will have [`cookieStore`](https://developer.mozilla.org/en-US/docs/Web/API/CookieStore).
   *
   * This feature flag needs to be enabled for plugins such as:
   * [JWT Plugin with cookies](https://the-guild.dev/graphql/hive/docs/gateway/authorization-authentication#token-lookup)
   *
   * You can learn more about the underlying GraphQL Yoga plugin [here](https://the-guild.dev/graphql/yoga-server/docs/features/cookies)
   */
  cookies?: boolean;
}

interface DisableIntrospectionOptions<TContext extends Record<string, any>> {
  disableIf?: (args: {
    context: GatewayContext & Partial<TContext>;
    params: ValidateFunctionParameters;
  }) => boolean;
}

interface ValidateFunctionParameters {
  /**
   * GraphQL schema instance.
   */
  schema: GraphQLSchema;
  /**
   * Parsed document node.
   */
  documentAST: DocumentNode;
  /**
   * The rules used for validation.
   * validate uses specifiedRules as exported by the GraphQL module if this parameter is undefined.
   */
  rules?: ValidationRule[];
  /**
   * TypeInfo instance which is used for getting schema information during validation
   */
  typeInfo?: TypeInfo;
  options?: {
    maxErrors?: number;
  };
}
