import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

describe('Variable Delegation', () => {
  /**
   * If provided a variable with a null value for a nested array, it should be passed correctly to the subschema.
   */
  it('pass nested array variables correctly', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          test(input: InputType!): [String!]
        }
        input InputType {
          value: [String!]
        }
      `,
      resolvers: {
        Query: {
          test: (_, args) => {
            // Returns the incoming variable value
            return args.input.value;
          },
        },
      },
    });

    const document = parse(/* GraphQL */ `
      query Test($value: [String!]) {
        test(input: { value: $value })
      }
    `);
    const variableValues = { value: null };

    const stitchedSchema = stitchSchemas({
      subschemas: [{ schema }],
    });

    const result = await normalizedExecutor({
      schema: stitchedSchema,
      document,
      variableValues,
    });

    expect(result).toEqual({
      data: {
        test: null,
      },
    });
  });
  /**
   * If provided a variable with an explicit null value for a field with a default value, the explicit null should be passed to the subschema.
   */
  it('pass explicit null for field with default value', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          test(input: InputType!): [String!]
        }
        input InputType {
          value: [String!] = ["default"]
        }
      `,
      resolvers: {
        Query: {
          test: (_, args) => {
            return args.input.value;
          },
        },
      },
    });

    const document = parse(/* GraphQL */ `
      query Test($value: [String!]) {
        test(input: { value: $value })
      }
    `);
    const variableValues = { value: null };

    const stitchedSchema = stitchSchemas({
      subschemas: [{ schema }],
    });

    const stitchedResult = await normalizedExecutor({
      schema: stitchedSchema,
      document,
      variableValues,
    });

    expect(stitchedResult).toEqual({
      data: {
        test: null,
      },
    });
  });
  /**
   * If provided no variable for a field with a default value, the default value should be used.
   */
  it('use default value when no variable provided', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          test(input: InputType!): [String!]
        }
        input InputType {
          value: [String!] = ["default"]
        }
      `,
      resolvers: {
        Query: {
          test: (_, args) => {
            return args.input.value;
          },
        },
      },
    });

    const document = parse(/* GraphQL */ `
      query Test {
        test(input: {})
      }
    `);

    const stitchedSchema = stitchSchemas({
      subschemas: [{ schema }],
    });

    const stitchedResult = await normalizedExecutor({
      schema: stitchedSchema,
      document,
    });

    expect(stitchedResult).toEqual({
      data: {
        test: ['default'],
      },
    });
  });
});
