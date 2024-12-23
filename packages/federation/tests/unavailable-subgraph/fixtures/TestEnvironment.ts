import { createServer, Server } from 'http';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { createYoga, YogaServerInstance } from 'graphql-yoga';
import { TestSubgraph1 } from './TestSubgraph1';
import { TestSubgraph2 } from './TestSubgraph2';

export class TestEnvironment {
  public readonly subgraph1: TestSubgraph1 = new TestSubgraph1();
  public readonly subgraph2: TestSubgraph2 = new TestSubgraph2();
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
    await new Promise<void>((resolve) =>
      this.yogaGateway?.listen(this.getTestPort(), () => resolve()),
    );
  }

  public async stop(): Promise<void> {
    // stop yoga geteway
    await new Promise<void>((resolve, reject) =>
      this.yogaGateway?.close((error) => (error ? reject(error) : resolve())),
    );
    // stop subgraphs
    await Promise.all([this.subgraph1.stop(), this.subgraph2.stop()]);
  }

  public getTestPort(): number {
    return parseInt(process.env['VITEST_POOL_ID'] ?? '1') + 3000;
  }
}
