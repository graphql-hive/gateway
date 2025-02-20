import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  RenameInterfaceFields,
  RenameObjectFields,
  wrapSchema,
} from '@graphql-tools/wrap';
import { graphql } from 'graphql';
import { describe, expect, test } from 'vitest';

describe('RenameInterfaceFields', () => {
  test('works', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        interface IWidget {
          name: String
        }

        type Widget implements IWidget {
          name: String
        }

        type Query {
          namedWidget: IWidget
        }
      `,
      resolvers: {
        Query: {
          namedWidget: () => ({ __typename: 'Widget', id: '1', name: 'gizmo' }),
        },
      },
    });

    const transformedSchema = wrapSchema({
      schema,
      transforms: [
        new RenameObjectFields((_typeName, fieldName) =>
          fieldName.replace(/^name/, 'title'),
        ),
        new RenameInterfaceFields((_typeName, fieldName) =>
          fieldName.replace(/^name/, 'title'),
        ),
      ],
    });

    const result = await graphql({
      schema: transformedSchema,
      source: /* GraphQL */ `
        {
          titledWidget {
            title
          }
        }
      `,
    });

    expect(result.data).toEqual({
      titledWidget: {
        title: 'gizmo',
      },
    });
  });
});
