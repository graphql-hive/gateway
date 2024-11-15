import { makeExecutableSchema } from '@graphql-tools/schema';
import { RenameRootFields, wrapSchema } from '@graphql-tools/wrap';
import { graphql } from 'graphql';
import { describe, expect, test } from 'vitest';

describe('RenameRootFields', () => {
  test('works', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Widget {
          id: ID!
          name: String
        }

        type Query {
          namedWidget: Widget
        }
      `,
      resolvers: {
        Query: {
          namedWidget: () => ({ id: '1', name: 'gizmo' }),
        },
      },
    });

    const transformedSchema = wrapSchema({
      schema,
      transforms: [
        new RenameRootFields((_typeName, fieldName) =>
          fieldName.replace(/^name/, 'title'),
        ),
      ],
    });

    const result = await graphql({
      schema: transformedSchema,
      source: /* GraphQL */ `
        {
          titledWidget {
            name
          }
        }
      `,
    });

    expect(result.data).toEqual({
      titledWidget: {
        name: 'gizmo',
      },
    });
  });
});
