import {
  createGatewayRuntime,
  GatewayCLIBuiltinPluginConfig,
  GatewayPlugin,
  getBuiltinPluginsFromConfig,
  getCacheInstanceFromConfig,
  getGraphQLWSOptions,
  PubSub,
  type GatewayConfig,
  type GatewayRuntime,
} from '@graphql-hive/gateway';
import {
  Logger as GatewayLogger,
  type LazyLoggerMessage,
} from '@graphql-mesh/types';
import {
  asArray,
  getResolversFromSchema,
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
import type { FastifyReply, FastifyRequest } from 'fastify';

export type HiveGatewayDriverConfig<
  TContext extends Record<string, any> = Record<string, any>,
> = GatewayConfig<TContext> &
  GatewayCLIBuiltinPluginConfig &
  GqlModuleOptions & {
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

  public async start({
    schema,
    typeDefs,
    resolvers,
    ...options
  }: HiveGatewayDriverConfig<TContext>): Promise<void> {
    const additionalTypeDefs: TypeSource[] = [];
    if (typeDefs) {
      additionalTypeDefs.push(typeDefs);
    }
    const additionalResolvers: IResolvers[] = [];
    if (resolvers) {
      additionalResolvers.push(...asArray(resolvers));
    }
    if (schema) {
      additionalTypeDefs.push(schema);
      const resolversFromSchema = getResolversFromSchema(schema);
      additionalResolvers.push(resolversFromSchema);
    }
    const contextPlugin: GatewayPlugin = {
      async onContextBuilding({ context, extendContext }) {
        const newContext =
          typeof options.context === 'function'
            ? await options.context(context)
            : options.context;
        extendContext(newContext);
      },
    };
    const logger = new NestJSLoggerAdapter(
      'Hive Gateway',
      {},
      new NestLogger('Hive Gateway'),
      options.debug ?? truthy(process.env['DEBUG']),
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
      logging: configCtx.logger,
      cache,
      graphqlEndpoint: options.path,
      additionalTypeDefs,
      additionalResolvers,
      disableIntrospection:
        options.introspection === false
          ? { disableIf: () => options.introspection || false }
          : undefined,
      ...options,
      ...(options.context
        ? {
            plugins: (ctx) => {
              const existingPlugins = options.plugins?.(ctx) || [];
              return [...builtinPlugins, ...existingPlugins, contextPlugin];
            },
          }
        : {}),
    });
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    const platformName = httpAdapter.getType();
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
          this._gatewayRuntime,
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
          if (!this._gatewayRuntime) {
            throw new Error('Hive Gateway is not initialized');
          }
          const {
            schema,
            execute,
            subscribe,
            contextFactory,
            parse,
            validate,
          } = this._gatewayRuntime.getEnveloped({
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
          schema: await this._gatewayRuntime.getSchema(),
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
    await this._subscriptionService?.stop();
    await this._gatewayRuntime?.dispose();
  }

  private registerExpress() {
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

function truthy(val: unknown) {
  return (
    val === true ||
    val === 1 ||
    ['1', 't', 'true', 'y', 'yes'].includes(String(val))
  );
}
