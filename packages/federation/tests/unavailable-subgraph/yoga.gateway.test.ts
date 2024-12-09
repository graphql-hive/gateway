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

    const nullableQuery = /* GraphQL */ `
      query {
        testNestedField {
          subgraph1_Nullable {
            testSuccessQuery {
              id
              email
              sub1
            }
          }
          subgraph2_Nullable {
            testErrorQuery {
              id
              email
              sub2
            }
          }
        }
      }
    `;

    const expectedNullableData = {
      testNestedField: {
        subgraph1_Nullable: {
          testSuccessQuery: {
            id: 'user1',
            email: 'user1@example.com',
            sub1: true,
          },
        },
        subgraph2_Nullable: {
          testErrorQuery: null,
        },
      },
    };

    const nonNullableQuery = /* GraphQL */ `
      query {
        testNestedField {
          subgraph1_NonNullable {
            testSuccessQuery {
              id
              email
              sub1
            }
          }
          subgraph2_NonNullable {
            testErrorQuery {
              id
              email
              sub2
            }
          }
        }
      }
    `;

    const expectedNonNullableData = {
      testNestedField: {
        subgraph1_NonNullable: {
          testSuccessQuery: {
            id: 'user1',
            email: 'user1@example.com',
            sub1: true,
          },
        },
        subgraph2_NonNullable: {
          testErrorQuery: null,
        },
      },
    };

    const expectedUnavailableErrors: GraphQLFormattedError[] = [
      {
        message: expect.stringMatching(
          /^connect ECONNREFUSED (127.0.0.1|::1):\d{4}$/,
        ),
        path: ['testNestedField'], // path should actually be ['testNestedField', 'subgraph2_Nullable | subgraph2_NonNullable', 'testErrorQuery'],
      },
    ];

    describe('EXPECTED RESPONSE - EVERYTHING OK', () => {
      it('subgraph2_Nullable.testErrorQuery - receive valid error if testErrorQuery throw an error', async () => {
        const expectedErrors: GraphQLFormattedError[] = [
          {
            message: 'My original subgraph2 error!',
            path: ['testNestedField', 'subgraph2_Nullable', 'testErrorQuery'],
          },
        ];

        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query: nullableQuery }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.data).toMatchObject(expectedNullableData);
        expect(result.errors).toMatchObject(expectedErrors);
      });

      it('subgraph2_NonNullable.testErrorQuery - receive valid error if testErrorQuery throw an error', async () => {
        const expectedErrors: GraphQLFormattedError[] = [
          {
            message: 'My original subgraph2 error!',
            path: [
              'testNestedField',
              'subgraph2_NonNullable',
              'testErrorQuery',
            ],
          },
        ];

        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query: nonNullableQuery }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.data).toMatchObject(expectedNonNullableData);
        expect(result.errors).toMatchObject(expectedErrors);
      });
    });

    describe('UNEXPECTED RESPONSE - FAILING TESTS', () => {
      beforeAll(async () => {
        await ctx.subgraph2.stop();
      });

      afterAll(async () => {
        await ctx.subgraph2.start();
      });

      it('subgraph2_Nullable.testErrorQuery - subgraph2 is unavailable', async () => {
        // it should be "expectedNullableData"
        const unexpectedData = {
          testNestedField: {
            ...expectedNullableData.testNestedField,
            subgraph2_Nullable: null,
          },
        };

        // the "ECONNREFUSED" error got completely lost somewhere along the way !!!
        const unexpectedErrors = undefined; // it should be "expectedUnavailableErrors"

        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query: nullableQuery }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.data).toMatchObject(unexpectedData);
        expect(result.errors).toBe(unexpectedErrors);
      });

      it('subgraph2_NonNullable.testErrorQuery - subgraph2 is unavailable', async () => {
        const unexpectedData = null; // it should be "expectedNonNullableData"

        // it should be "expectedUnavailableErrors"
        const unexpectedErrors: GraphQLFormattedError[] = [
          {
            message:
              'Cannot return null for non-nullable field TestNestedField.subgraph2_NonNullable.',
            path: ['testNestedField', 'subgraph2_NonNullable'],
          },
        ];

        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query: nonNullableQuery }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.data).toBe(unexpectedData);
        expect(result.errors).toMatchObject(unexpectedErrors);
      });

      it('subgraph2_Nullable.testErrorQuery only - subgraph2 is unavailable', async () => {
        const query = /* GraphQL */ `
          query {
            testNestedField {
              subgraph2_Nullable {
                testErrorQuery {
                  id
                  email
                  sub2
                }
              }
            }
          }
        `;

        const unexpectedData = null; // it should be:
        // const expectedNullableData = {
        //   testNestedField: {
        //     subgraph2_Nullable: {
        //       testErrorQuery: null,
        //     },
        //   },
        // };

        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.data).toBe(unexpectedData);
        expect(result.errors).toMatchObject(expectedUnavailableErrors);
      });

      it('subgraph2_NonNullable.testErrorQuery only - subgraph2 is unavailable', async () => {
        const query = /* GraphQL */ `
          query {
            testNestedField {
              subgraph2_NonNullable {
                testErrorQuery {
                  id
                  email
                  sub2
                }
              }
            }
          }
        `;

        const unexpectedData = null; // it should be:
        // const expectedNonNullableData = {
        //   testNestedField: {
        //     subgraph2_NonNullable: {
        //       testErrorQuery: null,
        //     },
        //   },
        // };

        const response = await ctx.yoga.fetch('http://yoga/graphql', {
          method: 'POST',
          body: JSON.stringify({ query }),
          headers: { 'content-type': 'application/json' },
        });

        const result: FormattedExecutionResult = await response.json();

        expect(response.status).toBe(200);
        expect(result.data).toBe(unexpectedData);
        expect(result.errors).toMatchObject(expectedUnavailableErrors);
      });
    });
  },
);
