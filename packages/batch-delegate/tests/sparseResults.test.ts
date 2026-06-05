import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { parse } from 'graphql';
import { describe, expect, test } from 'vitest';

// Regression test for DataLoader throwing
// "did not return a Promise of an Array" when the batch function resolves to
// a sparse array.
//
// `valuesFromResults` is free to return an array with holes — e.g. when it
// maps results back to keys by index and leaves the slot for an unmatched key
// unset. If the *last* key in the batch is the unmatched one, the array has a
// hole at `length - 1`. That array passes `Array.isArray`, but fails
// DataLoader's stricter `isArrayLike` check (which requires
// `hasOwnProperty(length - 1)`), so DataLoader throws.
//
// NB: a sparse array produced *inside a subschema resolver* does NOT reproduce
// this — GraphQL list completion densifies it (holes become `null`) before it
// reaches the batch function. The hole has to survive to the batch function's
// return, which is why this goes through `valuesFromResults`.
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
          // The last object's key has no matching property in the subschema,
          // so its slot is left as a hole by `valuesFromResults` below.
          { id: '2', propertyId: 'missing' },
        ],
        propertiesByIds: (_root, args: { ids: string[] }) =>
          args.ids.map((id) => (id === '1' ? { id, name: 'First' } : null)),
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
              // Map results back to keys by index, leaving unmatched keys as
              // holes — producing a sparse array with a trailing hole.
              valuesFromResults: (
                results: Array<{ id: string; name: string } | null>,
                keys,
              ) => {
                const byId = new Map(
                  results
                    .filter((r): r is { id: string; name: string } => r != null)
                    .map((r) => [r.id, r]),
                );
                const values: Array<{ id: string; name: string }> = [];
                keys.forEach((key, index) => {
                  const found = byId.get(key as string);
                  if (found) {
                    values[index] = found;
                  }
                });
                values.length = keys.length;
                return values;
              },
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

  test('does not throw and resolves unmatched trailing keys to null', async () => {
    const result = await normalizedExecutor({
      schema,
      document: parse(query),
    });

    expect(result).not.toHaveProperty('errors');
    expect(result).toMatchObject({
      data: {
        objects: [
          { id: '1', property: { id: '1', name: 'First' } },
          { id: '2', property: null },
        ],
      },
    });
  });
});
