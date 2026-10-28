import { delegateToSchema } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { forwardArgsToSelectionSet, stitchSchemas } from '../src/index.js';

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
describe('dynamic selectionSet during type merging', () => {
  it('injects function selectionSet deps into the merge fetch, then delegates to addVat', async () => {
    const priceForCountry = vi.fn(
      (
        _parent: { identifier: string },
        args: { countryCode: string },
      ) => (args.countryCode === 'GB' ? 1000 : null),
    );
    const addVat = vi.fn(
      (_root: unknown, args: { country: string; price: number }) =>
        args.country === 'GB' ? args.price * 1.2 : args.price,
    );

    // Providing subschema: full stone fields including priced-by-country.
    const schema2 = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Stone {
          identifier: ID!
          priceForCountry(countryCode: String!): Float
        }
        type Query {
          getStones(identifiers: [ID!]!): [Stone]!
        }
      `,
      resolvers: {
        Query: {
          getStones: (_root, { identifiers }) =>
            identifiers.map((identifier: string) => ({ identifier })),
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

    const schema1Subschema = {
      schema: schema1,
      merge: {
        Stone: {
          selectionSet: '{ identifier }',
          fieldName: 'stone',
          args: ({ identifier }: { identifier: string }) => ({ identifier }),
        },
      },
    };

    const schema2Subschema = {
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
                throw new Error('priceForCountry missing on merged stone');
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
    expect(priceForCountry).toHaveBeenCalled();
    expect(priceForCountry.mock.calls[0]?.[1]).toMatchObject({
      countryCode: 'GB',
    });
    expect(addVat).toHaveBeenCalled();
    expect(
      addVat.mock.calls[0]?.find(
        (arg) =>
          arg != null &&
          typeof arg === 'object' &&
          'country' in arg &&
          'price' in arg,
      ),
    ).toMatchObject({ country: 'GB', price: 1000 });
  });

  it('still resolves when the object already originates from the providing subschema', async () => {
    const addVat = vi.fn(
      (_root: unknown, args: { country: string; price: number }) =>
        args.country === 'US' ? args.price * 1.1 : args.price,
    );

    const gemsSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Stone {
          identifier: ID!
          priceForCountry(countryCode: String!): Float
        }
        type Query {
          getStones(identifiers: [ID!]!): [Stone]!
          stone(identifier: ID!): Stone
        }
      `,
      resolvers: {
        Query: {
          getStones: (_root, { identifiers }) =>
            identifiers.map((identifier: string) => ({ identifier })),
          stone: (_root, { identifier }) => ({ identifier }),
        },
        Stone: {
          priceForCountry: (_parent, args) =>
            args.countryCode === 'US' ? 1200 : null,
        },
      },
    });

    const catalogSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Stone {
          identifier: ID!
        }
        type Query {
          addVat(country: String!, price: Float!): Float!
        }
      `,
      resolvers: {
        Query: { addVat },
      },
    });

    const gemsSubschema = {
      schema: gemsSchema,
      merge: {
        Stone: {
          selectionSet: '{ identifier }',
          fieldName: 'getStones',
          key: ({ identifier }: { identifier: string }) => identifier,
          argsFromKeys: (identifiers: readonly string[]) => ({ identifiers }),
        },
      },
    };

    const catalogSubschema = {
      schema: catalogSchema,
    };

    const schema = stitchSchemas({
      subschemas: [gemsSubschema, catalogSubschema],
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
                schema: catalogSubschema,
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

    const result = await graphql({
      schema,
      source: /* GraphQL */ `
        query {
          stone(identifier: "stone-2") {
            salePrice(country: "US")
          }
        }
      `,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      stone: { salePrice: 1320 },
    });
    expect(addVat).toHaveBeenCalled();
    expect(
      addVat.mock.calls[0]?.find(
        (arg) =>
          arg != null &&
          typeof arg === 'object' &&
          'country' in arg &&
          'price' in arg,
      ),
    ).toMatchObject({ country: 'US', price: 1200 });
  });
});
