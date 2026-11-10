import { normalizedExecutor } from '@graphql-tools/executor';
import { stitchSchemas } from '@graphql-tools/stitch';
import { Executor } from '@graphql-tools/utils';
import { assertSingleExecutionValue } from '@internal/testing';
import { buildSchema, parse } from 'graphql';
import { describe, expect, it } from 'vitest';

describe('asynchronous external composite merging', () => {
  it('completes an abstract result with asynchronously merged entity fields', async () => {
    const source = buildSchema(`
        interface Node { id: ID! }
        type Row implements Node { id: ID! a: String }
        type Query { node: Node row(id: ID!): Row }
      `);
    const target = buildSchema(
      'type Row { id: ID! b: String } type Query { row(id: ID!): Row }',
    );
    const sourceExecutor: Executor = (request) =>
      normalizedExecutor({
        schema: source,
        document: request.document,
        variableValues: request.variables,
        contextValue: request.context,
        rootValue: {
          node: { __typename: 'Row', id: '1', a: 'source' },
          row: ({ id }: { id: string }) => ({ id, a: 'source' }),
        },
      });
    let targetCalls = 0;
    const targetExecutor: Executor = async (request) => {
      targetCalls++;
      await Promise.resolve();
      return normalizedExecutor({
        schema: target,
        document: request.document,
        variableValues: request.variables,
        contextValue: request.context,
        rootValue: {
          row: ({ id }: { id: string }) => ({
            id,
            b: () => Promise.resolve('merged'),
          }),
        },
      });
    };
    const schema = stitchSchemas({
      subschemas: [
        {
          schema: source,
          executor: sourceExecutor,
          merge: {
            Row: {
              selectionSet: '{ id }',
              fieldName: 'row',
              args: (object) => ({ id: object.id }),
            },
          },
        },
        {
          schema: target,
          executor: targetExecutor,
          merge: {
            Row: {
              selectionSet: '{ id }',
              fieldName: 'row',
              args: (object) => ({ id: object.id }),
            },
          },
        },
      ],
    });
    const result = await normalizedExecutor({
      schema,
      document: parse('{ node { __typename id ... on Row { a b } } }'),
    });
    expect(targetCalls).toBe(1);
    assertSingleExecutionValue(result);
    expect(result.data).toEqual({
      node: {
        __typename: 'Row',
        id: '1',
        a: 'source',
        b: 'merged',
      },
    });
    expect(result.errors).toBeUndefined();
  });
});
