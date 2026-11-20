import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

const query = /* GraphQL */ `
  query ($first: Int, $mode: String) {
    catalog(first: $first, mode: $mode) {
      id
      total
      products {
        id
        name
        price
      }
    }
  }
`;

async function post(
  port: number,
  variables: Record<string, unknown>,
  document = query,
) {
  const res = await fetch(`http://localhost:${port}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: document, variables }),
  });
  return {
    status: res.status,
    contentLength: res.headers.get('content-length'),
    text: await res.text(),
  };
}

async function setup() {
  const catalog = await service('catalog');
  const gw = await gateway({
    supergraph: { with: 'apollo', services: [catalog] },
  });
  return { catalog, gw };
}

it('answers with the bytes of the subgraph for an eligible query', async () => {
  const { catalog, gw } = await setup();
  const variables = { first: 50 };
  const fromSubgraph = await post(catalog.port, variables);
  const fromGateway = await post(gw.port, variables);
  expect(fromGateway.status).toBe(200);
  // JSON.stringify(value, null, 1) spacing: the gateway serializer would not write it
  expect(fromSubgraph.text).toContain('\n "data"');
  expect(fromGateway.text).toBe(fromSubgraph.text);
  expect(fromGateway.contentLength).toBe(
    String(Buffer.byteLength(fromSubgraph.text)),
  );
});

it('answers a large body byte for byte', async () => {
  const { catalog, gw } = await setup();
  const variables = { first: 7000 };
  const fromSubgraph = await post(catalog.port, variables);
  expect(fromSubgraph.text.length).toBeGreaterThan(500_000);
  const fromGateway = await post(gw.port, variables);
  expect(fromGateway.text).toBe(fromSubgraph.text);
});

it('executes an operation with two root fields as usual', async () => {
  const { gw } = await setup();
  const result = await post(
    gw.port,
    { first: 2 },
    /* GraphQL */ `
      query ($first: Int) {
        catalog(first: $first) {
          id
          total
          products {
            id
            name
            price
          }
        }
        count
      }
    `,
  );
  expect(JSON.parse(result.text)).toEqual({
    data: {
      catalog: {
        id: 'c1',
        total: 2,
        products: [
          { id: '1', name: 'Product 1', price: 0.25 },
          { id: '2', name: 'Product 2', price: 1.25 },
        ],
      },
      count: 7,
    },
  });
  // the regular serializer writes no whitespace
  expect(result.text).not.toContain('\n');
});

it('answers the regular error when the subgraph body breaks the schema', async () => {
  const { gw } = await setup();
  const result = await post(gw.port, { first: 2, mode: 'bad' });
  const body = JSON.parse(result.text);
  expect(body.data ?? null).toBeNull();
  expect(body.errors).toHaveLength(1);
  // the gateway masks the message of the coercion error
  expect(body.errors[0].path).toEqual(['catalog', 'total']);
});
