import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { parse } from 'graphql';
import { describe, expect, test } from 'vitest';

// Regression test for DataLoader throwing
// "did not return a Promise of an Array" when the batch resolves to a
// sparse array. This happens when `valuesFromResults` (or the subschema
// result) leaves a hole at the trailing slot — e.g. the last key in the
// batch has no matching row — because DataLoader's `isArrayLike` check
// requires `hasOwnProperty(length - 1)`.
describe('sparse batch results', () => {
  const subschema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Property {
        id: ID!
        name: String!
      }

      type Object {
        id: ID!
        propertyId: ID!
      }

      type Query {
        objects: [Object!]!
        propertiesByIds(ids: [ID!]!): [Property]!
      }
    `,
    resolvers: {
      Query: {
        objects: () => [
          { id: '1', propertyId: '1' },
          { id: '2', propertyId: 'missing' },
        ],
        // Returns a sparse array: only the first key is matched, the
        // trailing slot for the unmatched key is left as a hole.
        propertiesByIds: (_, args: { ids: string[] }) => {
          const result: Array<{ id: string; name: string }> = [];
          args.ids.forEach((id, index) => {
            if (id === '1') {
              result[index] = { id, name: 'First' };
            }
          });
          // The unmatched trailing index is never assigned, leaving a hole
          // while still reporting the expected length.
          result.length = args.ids.length;
          return result;
        },
      },
    },
  });

  const schema = stitchSchemas({
    subschemas: [subschema],
    typeDefs: /* GraphQL */ `
      extend type Object {
        property: Property
      }
    `,
    resolvers: {
      Object: {
        property: {
          selectionSet: '{ propertyId }',
          resolve: (source, _args, context, info) =>
            batchDelegateToSchema({
              schema: subschema,
              fieldName: 'propertiesByIds',
              key: source.propertyId,
              context,
              info,
            }),
        },
      },
    },
  });

  const query = /* GraphQL */ `
    query {
      objects {
        id
        property {
          id
          name
        }
      }
    }
  `;

  test('does not throw and pads missing trailing entries with null', async () => {
    const result = await normalizedExecutor({
      schema,
      document: parse(query),
    });

    expect(result).toMatchObject({
      data: {
        objects: [
          { id: '1', property: { id: '1', name: 'First' } },
          { id: '2', property: null },
        ],
      },
    });
    expect(result).not.toHaveProperty('errors');
  });
});
