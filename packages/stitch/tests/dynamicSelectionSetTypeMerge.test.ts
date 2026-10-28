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
 */
describe('dynamic selectionSet during type merging', () => {
  it('injects function selectionSet deps (with forwarded args) into the merge fetch', async () => {
    const priceForCountry = vi.fn(
      (_parent: { identifier: string }, args: { country: string }) =>
        args.country === 'GB' ? 1000 : null,
    );

    // Full stone fields live here (providing subschema).
    const gemsSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Stone {
          identifier: ID!
          priceForCountry(country: String!): Float
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

    // Stub origin: only the merge key.
    const catalogSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Stone {
          identifier: ID!
        }
        type Query {
          catalogStone(identifier: ID!): Stone
        }
      `,
      resolvers: {
        Query: {
          catalogStone: (_root, { identifier }) => ({ identifier }),
        },
      },
    });

    const schema = stitchSchemas({
      subschemas: [
        {
          schema: catalogSchema,
          merge: {
            Stone: {
              selectionSet: '{ identifier }',
              fieldName: 'catalogStone',
              args: ({ identifier }) => ({ identifier }),
            },
          },
        },
        {
          schema: gemsSchema,
          merge: {
            Stone: {
              selectionSet: '{ identifier }',
              fieldName: 'getStones',
              key: ({ identifier }) => identifier,
              argsFromKeys: (identifiers) => ({ identifiers }),
            },
          },
        },
      ],
      typeDefs: /* GraphQL */ `
        extend type Stone {
          salePrice(country: String!): Float
        }
      `,
      resolvers: {
        Stone: {
          salePrice: {
            selectionSet: forwardArgsToSelectionSet('{ priceForCountry }', {
              priceForCountry: ['country'],
            }),
            resolve: (root: { priceForCountry?: number | null }) =>
              root.priceForCountry,
          },
        },
      },
    });

    const result = await graphql({
      schema,
      source: /* GraphQL */ `
        query {
          catalogStone(identifier: "stone-1") {
            identifier
            salePrice(country: "GB")
          }
        }
      `,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      catalogStone: {
        identifier: 'stone-1',
        salePrice: 1000,
      },
    });
    expect(priceForCountry).toHaveBeenCalled();
    expect(priceForCountry.mock.calls[0]?.[1]).toMatchObject({ country: 'GB' });
  });

  it('still resolves when the object already originates from the providing subschema', async () => {
    const gemsSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Stone {
          identifier: ID!
          priceForCountry(country: String!): Float
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
            args.country === 'US' ? 1200 : null,
        },
      },
    });

    const schema = stitchSchemas({
      subschemas: [
        {
          schema: gemsSchema,
          merge: {
            Stone: {
              selectionSet: '{ identifier }',
              fieldName: 'getStones',
              key: ({ identifier }) => identifier,
              argsFromKeys: (identifiers) => ({ identifiers }),
            },
          },
        },
      ],
      typeDefs: /* GraphQL */ `
        extend type Stone {
          salePrice(country: String!): Float
        }
      `,
      resolvers: {
        Stone: {
          salePrice: {
            selectionSet: forwardArgsToSelectionSet('{ priceForCountry }', {
              priceForCountry: ['country'],
            }),
            resolve: (root: { priceForCountry?: number | null }) =>
              root.priceForCountry,
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
      stone: { salePrice: 1200 },
    });
  });
});
