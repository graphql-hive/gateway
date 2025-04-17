import { createServer, Server } from 'http';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import type { execute, ExecutionArgs, GraphQLError, subscribe } from 'graphql';
import { Disposable as GraphqlWsServer } from 'graphql-ws';
import { useServer } from 'graphql-ws/use/ws';
import { createPubSub, createYoga, YogaServerInstance } from 'graphql-yoga';
import { WebSocketServer } from 'ws';
import { TestSubgraph1 } from './TestSubgraph1';
import { TestSubgraph2 } from './TestSubgraph2';

type EnvelopedExecutionArgs = ExecutionArgs & {
  rootValue: {
    execute: typeof execute;
    subscribe: typeof subscribe;
  };
};

export const pubSub = createPubSub();
export function getTestPort(): number {
  return parseInt(process.env['JEST_WORKER_ID'] ?? '1') + 3000;
}

export class TestEnvironment {
  public readonly subgraph1: TestSubgraph1 = new TestSubgraph1();
  public readonly subgraph2: TestSubgraph2 = new TestSubgraph2();
  private graphqlWsServer?: GraphqlWsServer;
  private yogaGateway?: Server;
  #yoga?: YogaServerInstance<Record<string, unknown>, Record<string, unknown>>;
  public get yoga() {
    if (!this.#yoga) {
      throw Error('You have to start test environment first!');
    }

    return this.#yoga;
  }

  public async start(): Promise<void> {
    // start subgraphs
    await Promise.all([this.subgraph1.start(), this.subgraph2.start()]);

    // dynamic import is used only due to incompatibility with graphql@15
    const { IntrospectAndCompose, RemoteGraphQLDataSource } = await import(
      '@apollo/gateway'
    );
    const { supergraphSdl } = await new IntrospectAndCompose({
      subgraphs: [
        {
          name: 'subgraph1',
          url: `http://localhost:${this.subgraph1.port}/graphql`,
        },
        {
          name: 'subgraph2',
          url: `http://localhost:${this.subgraph2.port}/graphql`,
        },
      ],
    }).initialize({
      healthCheck: async () => Promise.resolve(),
      update: () => undefined,
      getDataSource: ({ url }) => new RemoteGraphQLDataSource({ url }),
    });

    // compose stitched schema
    const schema = getStitchedSchemaFromSupergraphSdl({ supergraphSdl });

    // start yoga geteway
    this.#yoga = createYoga({ schema, maskedErrors: false });
    this.yogaGateway = createServer(this.yoga);
    this.graphqlWsServer = this.createGraphqlWsServer(this.yogaGateway);

    await new Promise<void>((resolve) =>
      this.yogaGateway?.listen(getTestPort(), () => resolve()),
    );
  }

  public async stop(): Promise<void> {
    // stop yoga geteway
    await new Promise<void>((resolve, reject) =>
      this.yogaGateway?.close((error) => (error ? reject(error) : resolve())),
    );
    // stop subgraphs
    await Promise.all([this.subgraph1.stop(), this.subgraph2.stop()]);
    // stop websocket server
    await this.graphqlWsServer?.dispose();
  }

  private createGraphqlWsServer(server: Server): GraphqlWsServer {
    const wsServer = new WebSocketServer({
      server,
      path: this.yoga.graphqlEndpoint,
    });

    return useServer(
      {
        execute: async (args) =>
          (<EnvelopedExecutionArgs>args).rootValue.execute(args),
        subscribe: async (args) =>
          (<EnvelopedExecutionArgs>args).rootValue.subscribe(args),
        onSubscribe: async (ctx, _id, payload) => {
          const {
            schema,
            execute,
            subscribe,
            contextFactory,
            parse,
            validate,
          } = this.yoga.getEnveloped({
            params: payload,
            req: ctx.extra.request,
            socket: ctx.extra.socket,
          });

          const args: EnvelopedExecutionArgs = {
            schema,
            operationName: payload.operationName,
            document: parse(payload.query),
            variableValues: payload.variables,
            contextValue: await contextFactory(),
            rootValue: {
              execute,
              subscribe,
            },
          };

          const errors: GraphQLError[] = validate(args.schema, args.document);
          if (errors.length) {
            return errors;
          }

          return args;
        },
      },
      wsServer,
    );
  }
}
