import {
  FormattedExecutionResult,
  GraphQLFormattedError,
  versionInfo,
} from 'graphql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestEnvironment } from './fixtures/TestEnvironment';

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(versionInfo.major >= 16)(
  'Yoga gateway - subgraph unavailable',
  () => {
    let ctx: TestEnvironment;

    beforeAll(async () => {
      ctx = new TestEnvironment();
      await ctx.start();
    });

    afterAll(async () => {
      await ctx.stop();
    });

    const multiSubgraphQuery = /* GraphQL */ `
      query {
        testNestedField {
          subgraph1 {
            testSuccessQuery {
              id
              email
              sub1
            }
          }
          subgraph2 {
            testSuccessQuery {
              id
              email
              sub2
            }
          }
        }
      }
    `;

    const subgraph2Query = /* GraphQL */ `
      query {
        testNestedField {
          subgraph2 {
            testErrorQuery {
              id
              email
              sub2
            }
          }
        }
      }
    `;

    const expectedSubgraph2UnavailableData = {
      testNestedField: {
        subgraph1: {
          testSuccessQuery: {
            id: 'user1',
            email: 'user1@example.com',
            sub1: true,
          },
        },
        subgraph2: null,
      },
    };

    const expectedUnavailableErrors: GraphQLFormattedError[] = [
      {
        message: expect.stringMatching(
          /^connect ECONNREFUSED (127.0.0.1|::1):\d{4}$/,
        ),
        path: ['testNestedField'], // path should actually be ['testNestedField', 'subgraph2_Nullable | subgraph2_NonNullable', 'testErrorQuery'],
      },
      {
        message: expect.stringMatching(
          /^connect ECONNREFUSED (127.0.0.1|::1):\d{4}$/,
        ),
        path: ['testNestedField'], // path should actually be ['testNestedField', 'subgraph2_Nullable | subgraph2_NonNullable', 'testErrorQuery'],
      },
    ];

    describe('UNEXPECTED RESPONSE - FAILING TESTS', () => {
      beforeAll(async () => {
        await ctx.subgraph2.stop();
      });

      afterAll(async () => {
        await ctx.subgraph2.start();
      });

      it('subgraph1.testSuccessQuery - subgraph2 is unavailable', async () => {
        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query: multiSubgraphQuery }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.data).toMatchObject(expectedSubgraph2UnavailableData);
        // the "ECONNREFUSED" error got completely lost somewhere along the way !!!
        expect(result.errors).toBeDefined();
        expect(result.errors).toHaveLength(1);
      });

      it('subgraph2.testSuccessQuery - subgraph2 is unavailable', async () => {
        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query: subgraph2Query }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.errors).toMatchObject(expectedUnavailableErrors);
        // shouldn't be "testNestedField" resolved as null and not as an empty object?
        expect(result.data).toMatchObject({ testNestedField: null });
      });
    });
  },
);
