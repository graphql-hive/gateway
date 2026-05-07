import { join } from 'node:path';
import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

try {
  process.loadEnvFile(join(__dirname, '.env'));
} catch (e) {
  if (!process.env['CI']) {
    console.error(
      'Failed to load .env file, make sure it exists and is properly formatted',
      e,
    );
  }
}

const { gateway } = createTenv(__dirname);

const APOLLO_KEY =
  process.env['E2E_TEST_APOLLO_KEY'] || process.env['APOLLO_KEY']!;
const APOLLO_GRAPH_REF =
  process.env['E2E_TEST_APOLLO_GRAPH_REF'] || process.env['APOLLO_GRAPH_REF']!;

it.skipIf(!APOLLO_KEY || !APOLLO_GRAPH_REF)('works', async () => {
  const gw = await gateway({
    args: ['supergraph'],
    env: {
      APOLLO_KEY,
      APOLLO_GRAPH_REF,
    },
  });
  const result = await gw.execute({
    query: /* GraphQL */ `
      query HiveGatewayE2ETest {
        me {
          name
        }
      }
    `,
    headers: {
      'apollographql-client-name': 'HiveGatewayE2ETest',
      'apollographql-client-version': '1.0.0',
    },
  });
  expect(result).toEqual({
    data: {
      me: {
        name: expect.any(String),
      },
    },
  });
});
