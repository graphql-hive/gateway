import { LegacyLogger, Logger } from '@graphql-hive/logger';
import { TransportEntry } from '@graphql-mesh/transport-common';
import type { MeshFetch } from '@graphql-mesh/types';
import { buildSchema, OperationTypeNode, parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import httpTransport from '../src';

describe('HTTP Transport', () => {
  const log = new Logger({ level: false });
  const logger = new LegacyLogger(log);

  const subgraphName = 'test';
  it('interpolate the strings in headers', async () => {
    const fetch = vi.fn<MeshFetch>(async () =>
      Response.json({
        data: {
          test: 'test',
        },
      }),
    );
    const expectedToken = 'wowmuchsecret';
    const getTransportExecutor = (transportEntry: TransportEntry) =>
      httpTransport.getSubgraphExecutor({
        log,
        logger,
        subgraphName,
        transportEntry,
        fetch,
        getTransportExecutor,
        subgraph: buildSchema(/* GraphQL */ `
          type Query {
            test: String
          }
        `),
      });

    const executor = getTransportExecutor({
      kind: 'http',
      subgraph: subgraphName,
      headers: [['x-test', '{context.myToken}']],
    });

    await executor({
      document: parse(/* GraphQL */ `
        query {
          test
        }
      `),
      context: {
        myToken: expectedToken,
      },
    });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        'x-test': expectedToken,
      },
    });
  });

  it('should allow to specify subscription specific options', async () => {
    const fetch = vi.fn<MeshFetch>();

    const getTransportExecutor = (transportEntry: TransportEntry) =>
      httpTransport.getSubgraphExecutor({
        log,
        logger,
        subgraphName,
        transportEntry,
        fetch,
        getTransportExecutor,
        subgraph: buildSchema(/* GraphQL */ `
          type Subscription {
            test: String
          }
        `),
      });

    const executor = getTransportExecutor({
      kind: 'http',
      subgraph: subgraphName,
      options: {
        subscriptions: {
          kind: 'http',
          subgraph: subgraphName,
          options: {
            method: 'POST',
          },
        },
      },
    });

    await executor({
      operationType: OperationTypeNode.SUBSCRIPTION,
      document: parse(/* GraphQL */ `
        subscription {
          test
        }
      `),
    });

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
    });
  });
});
