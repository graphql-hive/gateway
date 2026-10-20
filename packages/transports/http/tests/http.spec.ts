import { Logger } from '@graphql-hive/logger';
import { TransportEntry } from '@graphql-mesh/transport-common';
import type { MeshFetch } from '@graphql-mesh/types';
import { assertAsyncIterable } from '@internal/testing';
import { buildSchema, OperationTypeNode, parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import httpTransport from '../src';

describe('HTTP Transport', () => {
  const log = new Logger({ level: false });

  const subgraphName = 'test';

  it('always uses mergeIncremental: false (passthrough multipart parts)', async () => {
    const boundary = '-';
    const parts = [
      { data: { hello: 'world' }, hasNext: true },
      {
        incremental: [{ data: { more: true }, path: [] }],
        hasNext: false,
      },
    ];
    let body = '';
    for (const part of parts) {
      body += `--${boundary}\r\n`;
      body += 'Content-Type: application/json; charset=utf-8\r\n\r\n';
      body += `${JSON.stringify(part)}\r\n`;
    }
    body += `--${boundary}--\r\n`;

    const fetch = vi.fn<MeshFetch>(
      async () =>
        new Response(body, {
          headers: {
            'Content-Type': `multipart/mixed; boundary="${boundary}"`,
          },
        }),
    );

    const executor = httpTransport.getSubgraphExecutor({
      log,
      logger,
      subgraphName,
      transportEntry: {
        kind: 'http',
        subgraph: subgraphName,
        // Even if a consumer tries to opt into accumulate, transport forces passthrough.
        // Not on HTTPTransportOptions on purpose - cast to prove override wins.
        options: { mergeIncremental: true } as Record<string, unknown>,
      },
      fetch,
      getTransportExecutor: () => {
        throw new Error('unused');
      },
      subgraph: buildSchema(/* GraphQL */ `
        type Query {
          hello: String
        }
      `),
    });

    const result = await executor({
      document: parse(/* GraphQL */ `
        query {
          hello
        }
      `),
    });
    assertAsyncIterable(result);
    const chunks: unknown[] = [];
    for await (const chunk of result) {
      chunks.push(structuredClone(chunk));
    }
    expect(chunks).toEqual(parts);
  });

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
