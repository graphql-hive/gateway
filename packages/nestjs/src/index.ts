import {
  createGatewayRuntime,
  GatewayCLIBuiltinPluginConfig,
  GatewayConfigProxy,
  GatewayConfigSubgraph,
  GatewayConfigSupergraph,
  GatewayPlugin,
  getBuiltinPluginsFromConfig,
  getCacheInstanceFromConfig,
  getGraphQLWSOptions,
  PubSub,
  type GatewayRuntime,
} from '@graphql-hive/gateway';
import {
  Logger as GatewayLogger,
  type LazyLoggerMessage,
} from '@graphql-mesh/types';
import {
  asArray,
  type IResolvers,
  type TypeSource,
} from '@graphql-tools/utils';
import { Injectable, Logger as NestLogger } from '@nestjs/common';
import {
  AbstractGraphQLDriver,
  GqlSubscriptionService,
  GraphQLWsSubscriptionsConfig,
  type GqlModuleOptions,
  type SubscriptionConfig,
} from '@nestjs/graphql';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { isDebug } from '~internal/env';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { lexicographicSortSchema } from 'graphql';

export type HiveGatewayDriverConfig<
  TContext extends Record<string, any> = Record<string, any>,
> =
  // we spread each of the GatewayConfig union members because not doing so breaks the types and does not merge the `cache` property together
  (
    | Omit<GatewayConfigSupergraph<TContext>, 'cache'>
    | Omit<GatewayConfigSubgraph<TContext>, 'cache'>
    | Omit<GatewayConfigProxy<TContext>, 'cache'>
  ) &
    GatewayCLIBuiltinPluginConfig &
    Omit<GqlModuleOptions, 'schema'> & {
      /**
       * If enabled, "subscriptions-transport-ws" will be automatically registered.
       */
      installSubscriptionHandlers?: boolean;
      /**
       * Subscriptions configuration.
       */
      subscriptions?: SubscriptionConfig;
    };

@Injectable()
export class HiveGatewayDriver<
  TContext extends Record<string, any>,
> extends AbstractGraphQLDriver<HiveGatewayDriverConfig<TContext>> {
  private _gatewayRuntime: GatewayRuntime<TContext> | undefined;
  private _subscriptionService?: GqlSubscriptionService;

  private async ensureGatewayRuntime({
    typeDefs,
    resolvers,
    ...options
  }: HiveGatewayDriverConfig<TContext>) {
    if (this._gatewayRuntime) {
      // the gateway runtime can already be initialized beacuse Nest calls `generateSchema` before `start`
      // dont create multiple instances, just return the existing one if it exists
      return this._gatewayRuntime;
    }
    const additionalTypeDefs: TypeSource[] = [];
    if (typeDefs) {
      additionalTypeDefs.push(typeDefs);
    }
    const additionalResolvers: IResolvers[] = [];
    if (resolvers) {
      additionalResolvers.push(...asArray(resolvers));
    }
    const logger = new NestJSLoggerAdapter(
      'Hive Gateway',
      {},
      new NestLogger('Hive Gateway'),
      options.debug ?? isDebug(),
    );
    const configCtx = {
      logger,
      cwd: process.cwd(),
      pubsub: options.pubsub || new PubSub(),
    };
    const cache = await getCacheInstanceFromConfig(options, configCtx);
    const builtinPlugins = await getBuiltinPluginsFromConfig(options, {
      ...configCtx,
      cache,
    });
    this._gatewayRuntime = createGatewayRuntime({
      ...options,
      logging: configCtx.logger,
      cache,
      graphqlEndpoint: options.path,
      additionalTypeDefs,
      additionalResolvers,
      disableIntrospection:
        options.introspection === false
          ? { disableIf: () => options.introspection || false }
          : undefined,
      ...(options.context || options.transformSchema || options.sortSchema
        ? {
            plugins: (ctx) => {
              const existingPlugins = options.plugins?.(ctx) || [];
              if (options.context) {
                const contextPlugin: GatewayPlugin = {
                  onContextBuilding: ({ context, extendContext }) =>
                    handleMaybePromise(
                      () =>
                        typeof options.context === 'function'
                          ? options.context(context)
                          : options.context,
                      extendContext,
                    ),
                };
                existingPlugins.push(contextPlugin);
              }
              if (options.transformSchema) {
                const schemaTransformPlugin: GatewayPlugin = {
                  onSchemaChange({ schema, replaceSchema }) {
                    return handleMaybePromise(
                      () => options.transformSchema!(schema),
                      replaceSchema,
                    );
                  },
                };
                existingPlugins.push(schemaTransformPlugin);
              }
              if (options.sortSchema) {
                const schemaSortPlugin: GatewayPlugin = {
                  onSchemaChange({ schema, replaceSchema }) {
                    replaceSchema(lexicographicSortSchema(schema));
                  },
                };
                existingPlugins.push(schemaSortPlugin);
              }
              return [...builtinPlugins, ...existingPlugins];
            },
          }
        : {}),
    });

    return this._gatewayRuntime;
  }
  public async start(
    options: HiveGatewayDriverConfig<TContext>,
  ): Promise<void> {
    const gatewayRuntime = await this.ensureGatewayRuntime(options);
    const platformName = this.httpAdapterHost.httpAdapter.getType();
    if (platformName === 'express') {
      this.registerExpress();
    } else if (platformName === 'fastify') {
      this.registerFastify();
    } else {
      throw new Error(`No support for current HttpAdapter: ${platformName}`);
    }
    if (options.installSubscriptionHandlers || options.subscriptions) {
      const subscriptionsOptions: SubscriptionConfig =
        options.subscriptions || { 'graphql-ws': {} };
      if (subscriptionsOptions['graphql-ws']) {
        const gwOptions = getGraphQLWSOptions<TContext, any>(
          gatewayRuntime,
          (ctx) => ({
            req: ctx.extra?.request,
            socket: ctx.extra?.socket,
          }),
        );
        subscriptionsOptions['graphql-ws'] = {
          ...gwOptions,
          ...(typeof subscriptionsOptions['graphql-ws'] === 'object'
            ? subscriptionsOptions['graphql-ws']
            : {}),
        } as GraphQLWsSubscriptionsConfig;
      }
      if (subscriptionsOptions['subscriptions-transport-ws']) {
        subscriptionsOptions['subscriptions-transport-ws'] =
          typeof subscriptionsOptions['subscriptions-transport-ws'] === 'object'
            ? subscriptionsOptions['subscriptions-transport-ws']
            : {};
        subscriptionsOptions['subscriptions-transport-ws'].onOperation = async (
          _msg: unknown,
          params: {
            query: string;
            variables: Record<string, any>;
            operationName: string;
            context: Record<string, any>;
          },
          ws: WebSocket,
        ) => {
          const {
            schema,
            execute,
            subscribe,
            contextFactory,
            parse,
            validate,
          } = gatewayRuntime.getEnveloped({
            ...params.context,
            req:
              // @ts-expect-error upgradeReq does exist but is untyped
              ws.upgradeReq,
            socket: ws,
            params,
          });

          const args = {
            schema,
            operationName: params.operationName,
            document:
              typeof params.query === 'string'
                ? parse(params.query)
                : params.query,
            variables: params.variables,
            context: await contextFactory(),
            rootValue: { execute, subscribe },
          };

          const errors = validate(args.schema, args.document);
          if (errors.length) return errors;
          return args;
        };
      }
      this._subscriptionService = new GqlSubscriptionService(
        {
          schema: await gatewayRuntime!.getSchema(),
          path: options.path,
          // @ts-expect-error - We know that execute and subscribe are defined
          execute: (args) => args.rootValue.execute(args),
          // @ts-expect-error - We know that execute and subscribe are defined
          subscribe: (args) => args.rootValue.subscribe(args),
          ...subscriptionsOptions,
        },
        this.httpAdapterHost.httpAdapter?.getHttpServer(),
      );
    }
  }

  public async stop(): Promise<void> {
    await Promise.all([
      this._subscriptionService?.stop(),
      this._gatewayRuntime?.dispose(),
    ]);
  }

  public override async generateSchema(
    options: HiveGatewayDriverConfig<TContext>,
  ) {
    const gatewayRuntime = await this.ensureGatewayRuntime(options);
    return gatewayRuntime.getSchema();
  }

  private registerExpress() {
    if (!this._gatewayRuntime) {
      throw new Error('Hive Gateway is not initialized');
    }
    this.httpAdapterHost.httpAdapter.use(this._gatewayRuntime);
  }
  private registerFastify() {
    this.httpAdapterHost.httpAdapter
      .getInstance()
      .all('*', async (req: FastifyRequest, reply: FastifyReply) => {
        if (!this._gatewayRuntime) {
          throw new Error('Hive Gateway is not initialized');
        }
        // Second parameter adds Fastify's `req` and `reply` to the GraphQL Context
        const response =
          await this._gatewayRuntime.handleNodeRequestAndResponse(req, reply, {
            req,
            reply,
          });
        response.headers.forEach((value, key) => {
          reply.header(key, value);
        });

        reply.status(response.status);

        reply.send(response.body);

        return reply;
      });
  }
}

class NestJSLoggerAdapter implements GatewayLogger {
  constructor(
    public name: string,
    private meta: Record<string, any>,
    private logger: NestLogger,
    private isDebug: boolean,
  ) {}
  private prepareMessage(args: LazyLoggerMessage[]) {
    const obj = {
      ...(this.meta || {}),
    };
    const strs: string[] = [];
    const flattenedArgs = args
      .flatMap((arg) => (typeof arg === 'function' ? arg() : arg))
      .flat(Number.POSITIVE_INFINITY);
    for (const arg of flattenedArgs) {
      if (typeof arg === 'string' || typeof arg === 'number') {
        strs.push(arg.toString());
      } else {
        Object.assign(obj, arg);
      }
    }
    return { obj, str: strs.join(', ') };
  }
  log(...args: any[]) {
    const { obj, str } = this.prepareMessage(args);
    if (Object.keys(obj).length) {
      this.logger.log(obj, str);
    } else {
      this.logger.log(str);
    }
  }
  info(...args: any[]) {
    const { obj, str } = this.prepareMessage(args);
    if (Object.keys(obj).length) {
      this.logger.log(obj, str);
    } else {
      this.logger.log(str);
    }
  }
  error(...args: any[]) {
    const { obj, str } = this.prepareMessage(args);
    if (Object.keys(obj).length) {
      this.logger.error(obj, str);
    } else {
      this.logger.error(str);
    }
  }
  warn(...args: any[]) {
    const { obj, str } = this.prepareMessage(args);
    if (Object.keys(obj).length) {
      this.logger.warn(obj, str);
    } else {
      this.logger.warn(str);
    }
  }
  debug(...args: any[]) {
    if (!this.isDebug) {
      return;
    }
    const { obj, str } = this.prepareMessage(args);
    if (Object.keys(obj).length) {
      this.logger.debug(obj, str);
    } else {
      this.logger.debug(str);
    }
  }
  child(
    newNameOrMeta: string | Record<string, string | number>,
  ): NestJSLoggerAdapter {
    const newName =
      typeof newNameOrMeta === 'string'
        ? this.name
          ? `${this.name}, ${newNameOrMeta}`
          : newNameOrMeta
        : this.name;
    const newMeta =
      typeof newNameOrMeta === 'string'
        ? this.meta
        : { ...this.meta, ...newNameOrMeta };
    return new NestJSLoggerAdapter(
      newName,
      newMeta,
      new NestLogger(newName),
      this.isDebug,
    );
  }
}
