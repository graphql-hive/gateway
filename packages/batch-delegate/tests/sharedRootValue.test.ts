import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { parse } from 'graphql';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// https://github.com/graphql-hive/gateway/issues/2630
// servers like mercurius pass the same rootValue object to every execution
// while the context is fresh per request, the loaders must not outlive the request
describe('shared rootValue across requests', () => {
  const itemsBySort: Record<string, string[]> = {};

  const getItems = vi.fn((sortBy: string) => itemsBySort[sortBy] || []);

  beforeEach(() => {
    itemsBySort['FEATURED'] = ['f1', 'f2', 'f3'];
    itemsBySort['NEWEST'] = ['n1', 'n2', 'n3'];
    getItems.mockClear();
  });

  const entitySchema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Entity {
        id: ID!
      }
      type Query {
        entity: Entity
      }
    `,
    resolvers: {
      Query: {
        entity: () => ({ id: '1' }),
      },
    },
  });

  const itemsSchema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Entity {
        id: ID!
        items(first: Int, sortBy: String): [String!]!
      }
      type Query {
        entitiesByIds(ids: [ID!]!): [Entity]!
      }
    `,
    resolvers: {
      Query: {
        entitiesByIds: (_root, { ids }) => ids.map((id: string) => ({ id })),
      },
      Entity: {
        items: (_entity, { first, sortBy }) => getItems(sortBy).slice(0, first),
      },
    },
  });

  function createStitchedSchema(dataLoaderOptions?: { cache: boolean }) {
    return stitchSchemas({
      subschemas: [
        { schema: entitySchema },
        {
          schema: itemsSchema,
          merge: {
            Entity: {
              selectionSet: '{ id }',
              fieldName: 'entitiesByIds',
              key: ({ id }) => id,
              argsFromKeys: (ids) => ({ ids }),
              dataLoaderOptions,
            },
          },
        },
      ],
    });
  }

  const document = parse(/* GraphQL */ `
    query Probe($sort: String) {
      entity {
        items(first: 3, sortBy: $sort)
      }
    }
  `);

  test('uses variable values of each request', async () => {
    const schema = createStitchedSchema();
    const rootValue = {};

    await expect(
      normalizedExecutor({
        schema,
        document,
        rootValue,
        contextValue: {},
        variableValues: { sort: 'FEATURED' },
      }),
    ).resolves.toEqual({
      data: { entity: { items: ['f1', 'f2', 'f3'] } },
    });

    await expect(
      normalizedExecutor({
        schema,
        document,
        rootValue,
        contextValue: {},
        variableValues: { sort: 'NEWEST' },
      }),
    ).resolves.toEqual({
      data: { entity: { items: ['n1', 'n2', 'n3'] } },
    });

    expect(getItems.mock.calls).toEqual([['FEATURED'], ['NEWEST']]);
  });

  test('uses variable values of each request with dataloader cache disabled', async () => {
    const schema = createStitchedSchema({ cache: false });
    const rootValue = {};

    await expect(
      normalizedExecutor({
        schema,
        document,
        rootValue,
        contextValue: {},
        variableValues: { sort: 'FEATURED' },
      }),
    ).resolves.toEqual({
      data: { entity: { items: ['f1', 'f2', 'f3'] } },
    });

    await expect(
      normalizedExecutor({
        schema,
        document,
        rootValue,
        contextValue: {},
        variableValues: { sort: 'NEWEST' },
      }),
    ).resolves.toEqual({
      data: { entity: { items: ['n1', 'n2', 'n3'] } },
    });

    expect(getItems.mock.calls).toEqual([['FEATURED'], ['NEWEST']]);
  });

  test('does not serve cached results from previous requests', async () => {
    const schema = createStitchedSchema();
    const rootValue = {};

    await expect(
      normalizedExecutor({
        schema,
        document,
        rootValue,
        contextValue: {},
        variableValues: { sort: 'FEATURED' },
      }),
    ).resolves.toEqual({
      data: { entity: { items: ['f1', 'f2', 'f3'] } },
    });

    itemsBySort['FEATURED'] = ['changed'];

    await expect(
      normalizedExecutor({
        schema,
        document,
        rootValue,
        contextValue: {},
        variableValues: { sort: 'FEATURED' },
      }),
    ).resolves.toEqual({
      data: { entity: { items: ['changed'] } },
    });

    expect(getItems).toHaveBeenCalledTimes(2);
  });
});
