import { makeExecutableSchema } from '@graphql-tools/schema';
import { WrapFields, wrapSchema } from '@graphql-tools/wrap';
import { graphql, GraphQLObjectType, isNullableType } from 'graphql';
import { describe, expect, test } from 'vitest';

describe('WrapFields', () => {
  const subschema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type User {
        id: ID!
        street: String
        city: String
        zipcode: String
      }

      type Query {
        user: User
      }
    `,
    resolvers: {
      Query: {
        user: () => ({
          id: '1',
          street: '7 Windy Shore Rd',
          city: 'Vancouver',
          zipcode: '12345',
        }),
      },
    },
  });

  const schema = wrapSchema({
    schema: subschema,
    transforms: [
      new WrapFields(
        'User',
        ['address'],
        ['Address'],
        ['street', 'city', 'zipcode'],
      ),
    ],
  });

  test('schema is transformed with new type and field', async () => {
    const userType = schema.getType('User') as GraphQLObjectType;
    const addressType = schema.getType('Address') as GraphQLObjectType;
    const addressField = userType.getFields()['address'];

    expect(isNullableType(addressField?.type)).toBe(false);
    expect(userType.getFields()['address']).toBeDefined();
    expect(Object.keys(addressType.getFields()).sort()).toEqual([
      'city',
      'street',
      'zipcode',
    ]);
  });

  test('new field is nullable if specified', async () => {
    const schema = wrapSchema({
      schema: subschema,
      transforms: [
        new WrapFields(
          'User',
          ['address'],
          ['Address'],
          ['street', 'city', 'zipcode'],
          undefined,
          { isNullable: true },
        ),
      ],
    });

    const userType = schema.getType('User') as GraphQLObjectType;
    const addressField = userType.getFields()['address'];

    expect(isNullableType(addressField?.type)).toBe(true);
  });

  test('select fields are wrapped and queryable', async () => {
    const result = await graphql({
      schema,
      source: /* GraphQL */ `
        query {
          user {
            id
            address {
              street
              city
              zipcode
            }
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        user: {
          id: '1',
          address: {
            street: '7 Windy Shore Rd',
            city: 'Vancouver',
            zipcode: '12345',
          },
        },
      },
    });
  });
});
