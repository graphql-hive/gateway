import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { buildSchema, execute, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { createDefaultExecutor } from '../src/delegateToSchema';

describe('field selected both with and without @skip/@include', () => {
  const typeDefs = /* GraphQL */ `
    type O1 {
      f0: String
      other: String
    }
    type Query {
      q0: O1
    }
  `;
  const subschema = makeExecutableSchema({
    typeDefs,
    resolvers: {
      Query: { q0: () => ({}) },
      O1: { f0: () => 'value', other: () => 'other' },
    },
  });
  const gateway = stitchSchemas({
    subschemas: [
      {
        schema: buildSchema(typeDefs),
        executor: createDefaultExecutor(subschema),
      },
    ],
  });

  it.each([
    ['{ q0 { f0 @skip(if: true) f0 } }', { f0: 'value' }],
    ['{ q0 { f0 f0 @include(if: false) } }', { f0: 'value' }],
    [
      '{ q0 { f0 @include(if: false) other } q0 { f0 } }',
      { other: 'other', f0: 'value' },
    ],
    ['query ($s: Boolean!) { q0 { f0 @skip(if: $s) f0 } }', { f0: 'value' }],
    [
      '{ q0 { f0 @skip(if: true) f0 @skip(if: true) other } }',
      { other: 'other' },
    ],
  ])('%s', async (query, q0) => {
    const document = parse(query);
    const variableValues = { s: true };
    const direct = await execute({
      schema: subschema,
      document,
      variableValues,
    });
    expect(direct).toEqual({ data: { q0 } });
    const result = await execute({ schema: gateway, document, variableValues });
    expect(result).toEqual(direct);
  });
});
