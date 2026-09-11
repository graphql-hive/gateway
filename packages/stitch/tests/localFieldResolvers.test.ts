import { makeExecutableSchema } from '@graphql-tools/schema';
import { ExecutionResult, graphql, parse, subscribe } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { stitchSchemas } from '../src/stitchSchemas.js';

const people: Record<string, any> = {
  '1': {
    id: '1',
    name: 'Remote',
    surname: 'RemoteSurname',
    friend: { id: '2', name: 'FriendName', surname: 'FriendSurname' },
  },
};

function createRemoteSubschema(
  personById = vi.fn((_root: unknown, { id }: { id: string }) => people[id]),
) {
  return {
    schema: makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Person {
          id: ID!
          name: String
          surname: String
          friend: Person
        }
        type Query {
          personById(id: ID!): Person
        }
      `,
      resolvers: {
        Query: { personById },
      },
    }),
    merge: {
      Person: {
        fieldName: 'personById',
        args: (originalResult: any) => ({ id: originalResult.id }),
        selectionSet: '{ id }',
      },
    },
  };
}

describe('local fields returning merged types', () => {
  it('resolves a mix of local and remote fields from a key-only local result', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({ id: '1' }),
        },
        Person: {
          name: () => 'Joe',
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          getPerson {
            name
            surname
          }
        }
      `,
    });
    // name comes from the local resolver, surname from the remote subschema
    expect(result).toEqual({
      data: { getPerson: { name: 'Joe', surname: 'RemoteSurname' } },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });

  it('does not delegate when the payload and local resolvers cover the request', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({ id: '1' }),
        },
        Person: {
          name: () => 'Joe',
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          getPerson {
            id
            name
          }
        }
      `,
    });
    expect(result).toEqual({
      data: { getPerson: { id: '1', name: 'Joe' } },
    });
    expect(personById).not.toHaveBeenCalled();
  });

  it('resolves aliased fields from the payload without delegating', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({ id: '1', name: 'Local' }),
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          getPerson {
            fullName: name
          }
        }
      `,
    });
    expect(result).toEqual({ data: { getPerson: { fullName: 'Local' } } });
    expect(personById).not.toHaveBeenCalled();
  });

  it('resolves aliased fields from local resolvers and delegates the rest', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({ id: '1' }),
        },
        Person: {
          name: () => 'Joe',
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          getPerson {
            fullName: name
            familyName: surname
          }
        }
      `,
    });
    expect(result).toEqual({
      data: { getPerson: { fullName: 'Joe', familyName: 'RemoteSurname' } },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });

  it('resolves aliased payload fields to null once delegation happens', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({ id: '1', name: 'Local' }),
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          getPerson {
            fullName: name
            familyName: surname
          }
        }
      `,
    });
    expect(result).toEqual({
      data: { getPerson: { fullName: 'Local', familyName: 'RemoteSurname' } },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });

  it('resolves aliases on nested payload objects to null once delegation happens', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({
            id: '1',
            friend: { id: '2', name: 'LocalFriend' },
          }),
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          getPerson {
            friend {
              nick: name
              surname
            }
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        getPerson: {
          friend: { nick: 'LocalFriend', surname: 'FriendSurname' },
        },
      },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });

  it('hydrates a typeDefs-defined field through the default resolver', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        type Query {
          personCreated: PersonCreated
        }
        type PersonCreated {
          person: Person
          cursor: String
        }
      `,
      resolvers: {
        Query: {
          personCreated: () => ({ person: { id: '1' }, cursor: 'c1' }),
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          personCreated {
            person {
              name
              surname
            }
            cursor
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        personCreated: {
          person: { name: 'Remote', surname: 'RemoteSurname' },
          cursor: 'c1',
        },
      },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });

  it('does not delegate when the local result already satisfies the request', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({
            id: '1',
            name: 'Local',
            surname: 'LocalSurname',
          }),
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          getPerson {
            name
            surname
          }
        }
      `,
    });
    expect(result).toEqual({
      data: { getPerson: { name: 'Local', surname: 'LocalSurname' } },
    });
    expect(personById).not.toHaveBeenCalled();
  });

  it('treats a subscription payload as the field value when no resolve is given', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        type Subscription {
          personCreated: PersonCreated
        }
        type PersonCreated {
          person: Person
          cursor: String
        }
      `,
      resolvers: {
        Subscription: {
          personCreated: {
            async *subscribe() {
              yield { personCreated: { person: { id: '1' }, cursor: 'c1' } };
            },
          },
        },
      },
    });
    const sub = (await subscribe({
      schema: stitchedSchema,
      document: parse(/* GraphQL */ `
        subscription {
          personCreated {
            person {
              name
            }
            cursor
          }
        }
      `),
    })) as AsyncIterableIterator<ExecutionResult>;
    const first = await sub.next();
    expect(first.value).toEqual({
      data: {
        personCreated: { person: { name: 'Remote' }, cursor: 'c1' },
      },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });

  it('hydrates partial results of a user resolver overriding a subschema field', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      resolvers: {
        Query: {
          // takes over the proxied field, but only returns the key
          personById: (_root: unknown, { id }: { id: string }) => ({ id }),
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          personById(id: "1") {
            name
            surname
          }
        }
      `,
    });
    expect(result).toEqual({
      data: { personById: { name: 'Remote', surname: 'RemoteSurname' } },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });

  it('keeps the proxying resolver of subschema fields without local resolvers', async () => {
    const personById = vi.fn(
      (_root: unknown, { id }: { id: string }) => people[id],
    );
    const stitchedSchema = stitchSchemas({
      subschemas: [createRemoteSubschema(personById)],
      typeDefs: /* GraphQL */ `
        extend type Query {
          getPerson: Person
        }
      `,
      resolvers: {
        Query: {
          getPerson: () => ({ id: '1' }),
        },
      },
    });
    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          personById(id: "1") {
            id
            name
          }
        }
      `,
    });
    expect(result).toEqual({
      data: { personById: { id: '1', name: 'Remote' } },
    });
    expect(personById).toHaveBeenCalledTimes(1);
  });
});
