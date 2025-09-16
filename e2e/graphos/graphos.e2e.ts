import { join } from 'path';
import { createTenv } from '@internal/e2e';
import { config } from 'dotenv';
import { expect, it } from 'vitest';

config({
  path: join(__dirname, '.env'),
});

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
        developer {
          fieldConfigs {
            errorRate
          }
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
      developer: {
        fieldConfigs: [],
      },
    },
  });
});
