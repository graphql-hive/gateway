import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { assertSingleExecutionValue } from '@internal/testing';
import { afterEach, expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

afterEach(() => {
  // clean up in case the pollution actually happened, otherwise every other test gets weird
  delete (Object.prototype as any).poc;
});

it('does not pollute Object.prototype through a __proto__ alias', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    subgraphs: [
      {
        name: 'echo',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              field1: Field1
            }
            type Field1 {
              field2: Field2
            }
            type Field2 {
              echo(input: String!): String!
            }
          `,
          resolvers: {
            Query: {
              field1: () => ({ field2: {} }),
            },
            Field2: {
              echo: (_: unknown, { input }: { input: string }) => input,
            },
          },
        },
      },
    ],
  });

  const res = await gw.execute({
    query: /* GraphQL */ `
      {
        field1 {
          __proto__: field2 {
            poc: echo(input: "pwned")
          }
        }
      }
    `,
  });
  assertSingleExecutionValue(res);

  expect(Object.hasOwn(Object.prototype, 'poc')).toBe(false);
  expect(res.errors).toBeUndefined();
});
