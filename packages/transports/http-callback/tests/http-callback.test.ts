import { LegacyLogger, Logger } from '@graphql-hive/logger';
import { MemPubSub } from '@graphql-hive/pubsub';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { buildSchema } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import httpCallbackTransport from '../src/index';

describe('transport-http-callback dispose', () => {
  it('exposes sync DisposableSymbols.dispose without @graphql-mesh/utils makeDisposable', () => {
    const log = new Logger({ level: false });
    const pubsub = new MemPubSub();
    const executor = httpCallbackTransport.getSubgraphExecutor({
      subgraphName: 'callback',
      transportEntry: {
        kind: 'http-callback',
        subgraph: 'callback',
        location: 'http://subgraph.local/graphql',
        options: {
          path: '/callback',
          public_url: 'http://gateway.local/callback',
        },
      },
      fetch: vi.fn(),
      pubsub,
      log,
      logger: new LegacyLogger(log),
      getTransportExecutor: () => {
        throw new Error('unused');
      },
      subgraph: buildSchema(/* GraphQL */ `
        type Query {
          hello: String
        }
      `),
    });

    const disposable = executor as typeof executor & Disposable;
    expect(typeof disposable[DisposableSymbols.dispose]).toBe('function');
    expect(() => disposable[DisposableSymbols.dispose]()).not.toThrow();
  });
});
