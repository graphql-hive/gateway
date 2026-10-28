import { delegateToSchema, SubschemaConfig } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql, GraphQLSchema } from 'graphql';
import { describe, expect, it, Mock, vi } from 'vitest';
import { forwardArgsToSelectionSet, stitchSchemas } from '../src/index.js';

type PriceForCountryFn = (
  parent: { identifier: string },
  args: { countryCode: string },
) => number | null;

type AddVatFn = (
  root: unknown,
  args: { country: string; price: number },
) => number;

/**
 * Gateway fields may declare a function `selectionSet` so dependencies can
 * forward arguments from the gateway field (see forwardArgsToSelectionSet).
 * Those land in stitchingInfo.dynamicSelectionSetsByField.
 *
 * Type-merge planning historically only injected static fieldNodesByField deps.
 * When an object originates from a stub subschema (key only) and is merged from
 * another, function selectionSet deps with args were skipped — so gateway
 * resolvers saw missing parent fields.
 *
 * Mirrors a common gateway pattern: merge pricing from one subschema, then
 * compute a final amount via a root field on another (e.g. addVat).
 */
function createSalePriceGateway(resolvers: {
  priceForCountry: PriceForCountryFn;
  addVat: AddVatFn;
}): {
  schema: GraphQLSchema;
  priceForCountry: Mock<PriceForCountryFn>;
  addVat: Mock<AddVatFn>;
} {
  const priceForCountry = vi.fn(resolvers.priceForCountry);
  const addVat = vi.fn(resolvers.addVat);

  // Providing subschema: full stone fields including priced-by-country.
  const schema2 = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Stone {
        identifier: ID!
        priceForCountry(countryCode: String!): Float
      }
      type Query {
        getStones(identifiers: [ID!]!): [Stone]!
        gemStone(identifier: ID!): Stone
      }
    `,
    resolvers: {
      Query: {
        getStones: (_root, { identifiers }) =>
          identifiers.map((identifier: string) => ({ identifier })),
        gemStone: (_root, { identifier }) => ({ identifier }),
      },
      Stone: { priceForCountry },
    },
  });

  // Stub origin + VAT helper (key-only stone + compute root field).
  const schema1 = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Stone {
        identifier: ID!
      }
      type Query {
        stone(identifier: ID!): Stone!
        addVat(country: String!, price: Float!): Float!
      }
    `,
    resolvers: {
      Query: {
        stone: (_root, { identifier }) => ({ identifier }),
        addVat,
      },
    },
  });

  const schema1Subschema: SubschemaConfig = {
    schema: schema1,
    merge: {
      Stone: {
        selectionSet: '{ identifier }',
        fieldName: 'stone',
        args: ({ identifier }: { identifier: string }) => ({ identifier }),
      },
    },
  };

  const schema2Subschema: SubschemaConfig = {
    schema: schema2,
    merge: {
      Stone: {
        selectionSet: '{ identifier }',
        fieldName: 'getStones',
        key: ({ identifier }: { identifier: string }) => identifier,
        argsFromKeys: (identifiers: readonly string[]) => ({ identifiers }),
      },
    },
  };

  const schema = stitchSchemas({
    subschemas: [schema1Subschema, schema2Subschema],
    typeDefs: /* GraphQL */ `
      extend type Stone {
        salePrice(country: String!): Float
      }
    `,
    resolvers: {
      Stone: {
        salePrice: {
          selectionSet: forwardArgsToSelectionSet('{ priceForCountry }', {
            priceForCountry: { country: 'countryCode' },
          }),
          resolve: (
            root: { priceForCountry?: number | null },
            args: { country: string },
            context,
            info,
          ) => {
            if (root.priceForCountry == null) {
              throw new Error('priceForCountry missing on stone');
            }
            return delegateToSchema({
              schema: schema1Subschema,
              operation: 'query',
              fieldName: 'addVat',
              args: {
                country: args.country,
                price: root.priceForCountry,
              },
              context,
              info,
            });
          },
        },
      },
    },
  });

  return { schema, priceForCountry, addVat };
}

function expectArgsContaining(
  mock: Mock,
  expected: Record<string, unknown>,
): void {
  expect(mock).toHaveBeenCalled();
  expect(
    mock.mock.calls[0]?.find(
      (arg) =>
        arg != null &&
        typeof arg === 'object' &&
        Object.keys(expected).every((key) => key in arg),
    ),
  ).toMatchObject(expected);
}

describe('dynamic selectionSet during type merging', () => {
  it('injects function selectionSet deps into the merge fetch, then delegates to addVat', async () => {
    const { schema, priceForCountry, addVat } = createSalePriceGateway({
      priceForCountry: (_parent, args) =>
        args.countryCode === 'GB' ? 1000 : null,
      addVat: (_root, args) =>
        args.country === 'GB' ? args.price * 1.2 : args.price,
    });

    const result = await graphql({
      schema,
      source: /* GraphQL */ `
        query {
          stone(identifier: "stone-1") {
            identifier
            salePrice(country: "GB")
          }
        }
      `,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      stone: {
        identifier: 'stone-1',
        salePrice: 1200,
      },
    });
    expectArgsContaining(priceForCountry, { countryCode: 'GB' });
    expectArgsContaining(addVat, { country: 'GB', price: 1000 });
  });

  it('still resolves when the object already originates from the providing subschema', async () => {
    const { schema, addVat } = createSalePriceGateway({
      priceForCountry: (_parent, args) =>
        args.countryCode === 'US' ? 1200 : null,
      addVat: (_root, args) =>
        args.country === 'US' ? args.price * 1.1 : args.price,
    });

    const result = await graphql({
      schema,
      source: /* GraphQL */ `
        query {
          gemStone(identifier: "stone-2") {
            salePrice(country: "US")
          }
        }
      `,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      gemStone: { salePrice: 1320 },
    });
    expectArgsContaining(addVat, { country: 'US', price: 1200 });
  });
});
