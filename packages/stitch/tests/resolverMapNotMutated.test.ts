import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql, GraphQLEnumType } from 'graphql';
import { describe, expect, it } from 'vitest';
import { stitchSchemas } from '../src/stitchSchemas.js';

// stitchSchemas wraps every user resolver whose field returns a merged type so
// the merged type's fields get resolved (addLocalFieldResolvers). That wrapper
// must land on the schema, not on the caller's resolver objects: a gateway that
// reuses one `resolvers` object across schema reloads would otherwise wrap the
// previous wrapper on every call, and every wrapper keeps its call's
// stitchingInfo — the entire superseded schema — reachable.
describe('stitchSchemas does not mutate the resolvers it is given', () => {
  const personMerge = {
    fieldName: 'personById',
    args: (originalResult: any) => ({ id: originalResult.id }),
    selectionSet: '{ id }',
  };
  // Enum internal value as an object: enum maps must pass through by
  // reference, or the value loses its identity in the stitched schema.
  const paidTier = { code: 'paid' };
  const subschemas = () => [
    {
      schema: makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Person {
            id: ID!
            name: String
          }
          type Query {
            personById(id: ID!): Person
          }
        `,
        resolvers: {
          Query: {
            personById: (_: unknown, { id }: { id: string }) => ({
              id,
              name: `person-${id}`,
            }),
          },
        },
      }),
      merge: { Person: personMerge },
    },
    {
      schema: makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Person {
            id: ID!
            email: String
          }
          type Account {
            id: ID!
            ownerId: ID!
            tier: Tier
          }
          enum Tier {
            FREE
            PAID
          }
          type Query {
            personById(id: ID!): Person
            account(id: ID!): Account
          }
        `,
        resolvers: {
          Query: {
            personById: (_: unknown, { id }: { id: string }) => ({
              id,
              email: `${id}@example.com`,
            }),
            account: (_: unknown, { id }: { id: string }) => ({
              id,
              ownerId: '7',
              tier: paidTier,
            }),
          },
          Tier: { FREE: { code: 'free' }, PAID: paidTier },
        },
      }),
      merge: { Person: personMerge },
    },
  ];

  it('keeps the caller resolve functions and configs identical across repeated calls', async () => {
    const resolveOwner = (account: { ownerId: string }) => ({
      id: account.ownerId,
    });
    // Field config object returning the merged type Person — exactly what
    // addLocalFieldResolvers wraps — next to an enum value map that must not
    // be copied.
    const additionalResolvers = {
      Account: {
        owner: { selectionSet: '{ ownerId }', resolve: resolveOwner },
      },
      Tier: { FREE: { code: 'free' }, PAID: paidTier },
    };
    const stitch = () =>
      stitchSchemas({
        subschemas: subschemas(),
        typeDefs: /* GraphQL */ `
          extend type Account {
            owner: Person
            label: String
          }
        `,
        // Two maps for the same type: mergeResolvers deep-merges them into a
        // new `Account` object, but still reuses the `owner` field config by
        // reference, so this is the case where the wrapper reached the caller.
        resolvers: [additionalResolvers, { Account: { label: () => 'acct' } }],
      });

    const first = stitch();
    expect(additionalResolvers.Account.owner.resolve).toBe(resolveOwner);

    const second = stitch();
    expect(additionalResolvers.Account.owner.resolve).toBe(resolveOwner);
    expect(additionalResolvers.Account.owner.selectionSet).toBe('{ ownerId }');
    expect(additionalResolvers.Tier.PAID).toBe(paidTier);
    expect(
      (second.getType('Tier') as GraphQLEnumType).getValue('PAID')?.value,
    ).toBe(paidTier);

    // The wrapper is on the schema, and the stitched field still resolves the
    // merged type through it on both builds.
    for (const schema of [first, second]) {
      const result = await graphql({
        schema,
        source: /* GraphQL */ `
          {
            account(id: "a1") {
              owner {
                id
                name
                email
              }
              label
              tier
            }
          }
        `,
      });
      expect(result).toEqual({
        data: {
          account: {
            owner: { id: '7', name: 'person-7', email: '7@example.com' },
            label: 'acct',
            tier: 'PAID',
          },
        },
      });
    }
  });

  // The mutation is not only a leak: `wrappedResolve` closes over its own
  // call's `stitchingInfo`, and when the wrappers nest the innermost (oldest)
  // one runs first. So a field reusing the caller's config hydrates through a
  // superseded call's stitching plan and executors, and once that hydration
  // fills the selection the newest wrapper finds nothing missing to resolve.
  it('resolves through the current subschemas after the resolvers are reused', async () => {
    const subschemaForGeneration = (generation: string) => ({
      schema: makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Person {
            id: ID!
            name: String
          }
          type Account {
            id: ID!
            ownerId: ID!
          }
          type Query {
            personById(id: ID!): Person
            account(id: ID!): Account
          }
        `,
        resolvers: {
          Query: {
            // the generation is baked into this subschema's data, so the answer
            // names whichever generation actually served the delegation
            personById: (_: unknown, { id }: { id: string }) => ({
              id,
              name: `person-${id}-from-${generation}`,
            }),
            account: (_: unknown, { id }: { id: string }) => ({
              id,
              ownerId: '7',
            }),
          },
        },
      }),
      merge: { Person: personMerge },
    });

    // the long-lived object: built once, handed to every call
    const additionalResolvers = {
      Account: {
        owner: {
          selectionSet: '{ ownerId }',
          // returns only the merge key, so `name` must be delegated
          resolve: (account: { ownerId: string }) => ({ id: account.ownerId }),
        },
      },
    };

    const ownerName = async (generation: string) => {
      const schema = stitchSchemas({
        subschemas: [subschemaForGeneration(generation)],
        typeDefs: /* GraphQL */ `
          extend type Account {
            owner: Person
          }
        `,
        resolvers: [additionalResolvers],
      });
      const result = await graphql({
        schema,
        source: /* GraphQL */ `
          {
            account(id: "1") {
              owner {
                name
              }
            }
          }
        `,
      });
      expect(result.errors).toBeUndefined();
      return (result.data as any).account.owner.name;
    };

    expect(await ownerName('generation-1')).toBe('person-7-from-generation-1');
    expect(await ownerName('generation-2')).toBe('person-7-from-generation-2');
    expect(await ownerName('generation-3')).toBe('person-7-from-generation-3');
  });
});
