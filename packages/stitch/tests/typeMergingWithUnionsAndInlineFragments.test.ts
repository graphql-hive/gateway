import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import { graphql, GraphQLSchema } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stitchSchemas } from '../src/stitchSchemas.js';

describe('Unions and Inline Fragments', () => {
  const { allStitchingDirectivesTypeDefs, stitchingDirectivesTransformer } =
    stitchingDirectives();

  const studentTypeDefs = /* GraphQL */ `
    ${allStitchingDirectivesTypeDefs}
    type Query {
      student(id: String!): Student
    }

    type Student {
      id: String!
      name: String!
      major: Major!
    }

    union Major = StubMajor

    type StubMajor {
      id: String!
    }
  `;

  const majorsTypeDefs = /* GraphQL */ `
    ${allStitchingDirectivesTypeDefs}
    type Query {
      major(id: String!): Major @merge(keyField: "id")
    }

    union Major = MajorError | MajorSuccess
    type MajorError {
      id: String!
      code: String!
    }

    type MajorSuccess {
      id: String!
      name: String!
    }
  `;

  let stitchedSchema: GraphQLSchema;
  let majorQuery: (args: {
    id: string;
  }) => Promise<{ id: string; name: string } | { id: string; code: string }>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    majorQuery = async (args: { id: string }) => ({
      id: args.id,
      name: 'Communications',
    });

    const studentSchema = makeExecutableSchema({
      typeDefs: studentTypeDefs,
      resolvers: {
        Major: {
          __resolveType: () => 'StubMajor',
        },
        Query: {
          student: async (_source: unknown, args: { id: string }) => ({
            id: args.id,
            name: 'Bob',
            major: {
              id: 'COMM.1231',
            },
          }),
        },
      },
      resolverValidationOptions: { requireResolversForResolveType: 'ignore' },
    });

    const majorsSchema = makeExecutableSchema({
      typeDefs: majorsTypeDefs,
      resolvers: {
        Major: {
          __resolveType: (obj: { name?: string; code?: string }) => {
            if (obj.name) return 'MajorSuccess';
            if (obj.code) return 'MajorError';
            return null;
          },
        },
        Query: {
          major: async (_source: unknown, args: { id: string }) =>
            majorQuery(args),
        },
      },
      resolverValidationOptions: { requireResolversForResolveType: 'ignore' },
    });

    stitchedSchema = stitchSchemas({
      subschemas: [{ schema: studentSchema }, { schema: majorsSchema }],
      subschemaConfigTransforms: [stitchingDirectivesTransformer],
      resolverValidationOptions: { requireResolversForResolveType: 'ignore' },
    });
  });

  // Ported from ardatan/graphql-tools#4965 — union merge + inline fragments still returns empty major
  it.fails('handles success', async () => {
    const query = /* GraphQL */ `
      query {
        student(id: "12314241") {
          id
          name
          major {
            ... on MajorSuccess {
              id
              name
            }
            ... on MajorError {
              id
              code
            }
          }
        }
      }
    `;

    const result = await graphql({
      schema: stitchedSchema,
      source: query,
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      student: {
        id: '12314241',
        name: 'Bob',
        major: {
          id: 'COMM.1231',
          name: 'Communications',
        },
      },
    });
  });

  it.fails('handles error', async () => {
    const query = /* GraphQL */ `
      query {
        student(id: "12314241") {
          id
          name
          major {
            ... on MajorSuccess {
              id
              name
            }
            ... on MajorError {
              id
              code
            }
          }
        }
      }
    `;
    majorQuery = async () => ({ id: 'COMM.1231', code: 'NOT_FOUND' });
    const result = await graphql({
      schema: stitchedSchema,
      source: query,
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      student: {
        id: '12314241',
        name: 'Bob',
        major: {
          id: 'COMM.1231',
          code: 'NOT_FOUND',
        },
      },
    });
  });
});
