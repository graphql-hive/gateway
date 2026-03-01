import { createDefaultExecutor } from '@graphql-tools/delegate';
import { normalizedExecutor } from '@graphql-tools/executor';
import { stitchSchemas } from '@graphql-tools/stitch';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import { Executor, IResolvers } from '@graphql-tools/utils';
import arrayShuffle from 'array-shuffle';
import { parse } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { expect, it, vi } from 'vitest';

it('reproduction #1305', async () => {
  const { allStitchingDirectivesTypeDefs, stitchingDirectivesTransformer } =
    stitchingDirectives();
  const typeDefs = parse(/* GraphQL */ `
    schema {
      query: Query
    }

    ${allStitchingDirectivesTypeDefs}

    type Query {
      box(id: ID!): Box @merge(keyField: "id") @canonical
    }

    type Box @canonical {
      id: ID!
      items(shuffle: Boolean): [Item]
    }

    interface Item {
      name: String!
    }

    interface Edible {
      calories: Int
    }

    type Fruit implements Item & Edible {
      name: String!
      calories: Int
    }

    type OfficeSupply implements Item {
      name: String!
    }
  `);
  const data: Record<string, any> = {
    boxes: {
      '1': {
        id: '1',
        items: [
          {
            __typename: 'Fruit',
            name: 'Apple',
            calories: 95,
          },
          {
            __typename: 'Fruit',
            name: 'Banana',
            calories: 105,
          },
          {
            __typename: 'Fruit',
            name: 'Cherry',
            calories: 50,
          },
          {
            __typename: 'OfficeSupply',
            name: 'Pen',
          },
        ],
      },
    },
  };
  const resolvers: IResolvers = {
    Query: {
      box: (_, args) => data['boxes'][args.id] ?? null,
    },
    Box: {
      items: (box, args) =>
        args.shuffle === true ? arrayShuffle(box.items) : box.items,
    },
  };
  const subgraphSchema = createSchema({
    typeDefs,
    resolvers,
  });
  const executor = createDefaultExecutor(subgraphSchema);
  const wrappedExecutor = vi.fn(executor);
  const stitchedSchema = stitchSchemas({
    subschemas: [
      {
        schema: subgraphSchema,
        executor: wrappedExecutor as Executor,
      },
    ],
    subschemaConfigTransforms: [stitchingDirectivesTransformer],
  });

  const result: any = await normalizedExecutor({
    schema: stitchedSchema,
    document: parse(/* GraphQL */ `
      query {
        box(id: "1") {
          items {
            name
            ... on Edible {
              calories
            }
          }
        }
      }
    `),
    contextValue: {},
  });
  expect(result.data.box.items).toHaveLength(4);
  expect(wrappedExecutor).toHaveBeenCalledTimes(1);
});
