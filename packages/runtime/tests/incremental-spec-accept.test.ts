import {
  getMultipartContentType,
  INCREMENTAL_DELIVERY_SPECS,
} from '@graphql-tools/utils';
import { createSchema } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      fast: String!
      slow: String!
    }
  `,
  resolvers: {
    Query: {
      fast: () => 'fast',
      slow: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'slow';
      },
    },
  },
});

function acceptForSpec(id: 'v0.1' | 'v0.2') {
  // Only multipart: Yoga's result-processor loop lets the `regular` JSON
  // processor overwrite multipart whenever JSON also appears in Accept.
  return getMultipartContentType(
    INCREMENTAL_DELIVERY_SPECS.find((s) => s.id === id)!,
    { echoSpec: true },
  );
}

const deferQuery = /* GraphQL */ `
  query {
    fast
    ... @defer(label: "slow") {
      slow
    }
  }
`;

describe('gateway incrementalSpec Accept negotiation (Yoga 6)', () => {
  it('echoes deferSpec=20220824 Content-Type for v0.1 Accept', async () => {
    await using gw = createGatewayRuntime({
      subgraph: schema,
      deferStream: true,
      logging: false,
    });
    const res = await gw.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: acceptForSpec('v0.1'),
      },
      body: JSON.stringify({ query: deferQuery }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('multipart/mixed');
    expect(res.headers.get('content-type')).toContain('deferSpec=20220824');
  });

  it('echoes incrementalSpec=v0.2 Content-Type when client requests v0.2', async () => {
    await using gw = createGatewayRuntime({
      subgraph: schema,
      deferStream: true,
      logging: false,
    });
    const res = await gw.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: acceptForSpec('v0.2'),
      },
      body: JSON.stringify({ query: deferQuery }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('multipart/mixed');
    expect(res.headers.get('content-type')).toContain('incrementalSpec=v0.2');
  });
});
