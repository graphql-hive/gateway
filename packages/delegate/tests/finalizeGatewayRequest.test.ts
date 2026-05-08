import { DelegationContext } from '@graphql-tools/delegate';
import {
  bookingSchema,
  propertySchema,
} from '@internal/testing/fixtures/schemas';
import { buildSchema, parse, print } from 'graphql';
import { describe, expect, it, test } from 'vitest';
import { finalizeGatewayRequest } from '../src/finalizeGatewayRequest.js';

describe('finalizeGatewayRequest', () => {
  test('should remove empty selection sets on objects', () => {
    const query = parse(/* GraphQL */ `
      query customerQuery($id: ID!) {
        customerById(id: $id) {
          id
          name
          address {
            planet
          }
        }
      }
    `);
    const filteredQuery = finalizeGatewayRequest(
      {
        document: query,
        variables: {
          id: 'c1',
        },
      },
      {
        targetSchema: bookingSchema,
      } as DelegationContext,
      () => {},
    );

    const expected = parse(/* GraphQL */ `
      query customerQuery($id: ID!) {
        customerById(id: $id) {
          id
          name
        }
      }
    `);
    expect(print(filteredQuery.document)).toBe(print(expected));
  });

  test('should also remove variables when removing empty selection sets', () => {
    const query = parse(/* GraphQL */ `
      query customerQuery($id: ID!, $limit: Int) {
        customerById(id: $id) {
          id
          name
          bookings(limit: $limit) {
            paid
          }
        }
      }
    `);
    const filteredQuery = finalizeGatewayRequest(
      {
        document: query,
        variables: {
          id: 'c1',
          limit: 10,
        },
      },
      {
        targetSchema: bookingSchema,
      } as DelegationContext,
      () => {},
    );

    const expected = parse(/* GraphQL */ `
      query customerQuery($id: ID!) {
        customerById(id: $id) {
          id
          name
        }
      }
    `);
    expect(print(filteredQuery.document)).toBe(print(expected));
  });

  test('should not remove used variables in nested inputs', () => {
    const query = parse(/* GraphQL */ `
      query jsonTestQuery($test: String!) {
        jsonTest(input: [{ test: $test }])
      }
    `);
    const filteredQuery = finalizeGatewayRequest(
      {
        document: query,
        variables: {
          test: 'test',
        },
      },
      {
        targetSchema: propertySchema,
      } as DelegationContext,
      () => {},
    );

    const expected = parse(/* GraphQL */ `
      query jsonTestQuery($test: String!) {
        jsonTest(input: [{ test: $test }])
      }
    `);
    expect(filteredQuery.variables).toEqual({ test: 'test' });
    expect(print(filteredQuery.document)).toBe(print(expected));
  });

  test('should remove empty selection sets on wrapped objects (non-nullable/lists)', () => {
    const query = parse(/* GraphQL */ `
      query bookingQuery($id: ID!) {
        bookingById(id: $id) {
          id
          propertyId
          customer {
            favoriteFood
          }
        }
      }
    `);
    const filteredQuery = finalizeGatewayRequest(
      {
        document: query,
        variables: {
          id: 'b1',
        },
      },
      {
        targetSchema: bookingSchema,
      } as DelegationContext,
      () => {},
    );

    const expected = parse(/* GraphQL */ `
      query bookingQuery($id: ID!) {
        bookingById(id: $id) {
          id
          propertyId
        }
      }
    `);
    expect(print(filteredQuery.document)).toBe(print(expected));
  });

  describe('Spreading on unions', () => {
    const targetSchema = buildSchema(/* GraphQL */ `
      type Query {
        foo: Foo
      }

      union Foo = Bar | Baz

      type Bar {
        id: ID!
        name: String
      }

      type Baz {
        id: ID!
        name: Name
      }

      type Name {
        first: String
        last: String
      }
    `);
    it('should remove fields with selection sets on leaf types', () => {
      const query = parse(/* GraphQL */ `
        query foo {
          foo {
            name {
              first
              last
            }
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        {
          document: query,
        },
        {
          targetSchema,
        } as DelegationContext,
        () => {},
      );
      expect(print(filteredQuery.document)).toBe(`query foo {
  foo {
    __typename
    ... on Baz {
      name {
        first
        last
      }
    }
  }
}`);
    });
    it('should remove fields without selection sets on composite types', () => {
      const query = parse(/* GraphQL */ `
        query foo {
          foo {
            name
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        {
          document: query,
        },
        {
          targetSchema,
        } as DelegationContext,
        () => {},
      );
      expect(print(filteredQuery.document)).toBe(`query foo {
  foo {
    __typename
    ... on Bar {
      name
    }
  }
}`);
    });
    it('should remove fields that dont exist in schema', () => {
      const query = parse(/* GraphQL */ `
        query foo {
          foo {
            name
            nickname
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        {
          document: query,
        },
        {
          targetSchema,
        } as DelegationContext,
        () => {},
      );
      expect(print(filteredQuery.document)).toMatchInlineSnapshot(`
        "query foo {
          foo {
            __typename
            ... on Bar {
              name
            }
          }
        }"
      `);
    });
    it('should remove nested fields that dont exist in schema', () => {
      const query = parse(/* GraphQL */ `
        query foo {
          foo {
            name {
              first
              nickname
            }
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        {
          document: query,
        },
        {
          targetSchema,
        } as DelegationContext,
        () => {},
      );
      expect(print(filteredQuery.document)).toMatchInlineSnapshot(`
        "query foo {
          foo {
            __typename
            ... on Baz {
              name {
                first
              }
            }
          }
        }"
      `);
    });
    it('should remove fields whose nested fields dont exist in schema', () => {
      const query = parse(/* GraphQL */ `
        query foo {
          foo {
            name {
              nickname
            }
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        {
          document: query,
        },
        {
          targetSchema,
        } as DelegationContext,
        () => {},
      );
      expect(print(filteredQuery.document)).toMatchInlineSnapshot(`
          "query foo {
            foo {
              __typename
            }
          }"
        `);
    });
  });

  describe('@provides conditional injection', () => {
    // Mirrors the @provides scenario in Federation: the gateway should
    // only forward the @provides fields the client actually requested, never
    // the full @provides selection set.
    function buildEntityScenario() {
      const targetSchema = buildSchema(/* GraphQL */ `
        type Query {
          entity: Entity
        }

        type Entity {
          id: ID!
        }
      `);
      const subschema = {} as any;
      function makeContext(): DelegationContext {
        return {
          targetSchema,
          subschema,
          info: {
            schema: {
              extensions: {
                stitchingInfo: {
                  mergedTypes: {
                    Query: {
                      providedSelectionsByField: new Map([
                        [
                          subschema,
                          {
                            entity: (
                              parse(/* GraphQL */ `
                                {
                                  name
                                  description
                                }
                              `).definitions[0] as any
                            ).selectionSet,
                          },
                        ],
                      ]),
                    },
                  },
                },
              },
            },
          },
        } as unknown as DelegationContext;
      }
      return { targetSchema, makeContext };
    }

    test('only injects the @provides fields that the client actually requested', () => {
      const { makeContext } = buildEntityScenario();
      const query = parse(/* GraphQL */ `
        query {
          entity {
            id
            name
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        { document: query },
        makeContext(),
        () => {},
      );
      expect(print(filteredQuery.document)).toMatchInlineSnapshot(`
        "{
          entity {
            name
            id
          }
        }"
      `);
    });

    test('does not inject any @provides field when none were requested', () => {
      const { makeContext } = buildEntityScenario();
      const query = parse(/* GraphQL */ `
        query {
          entity {
            id
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        { document: query },
        makeContext(),
        () => {},
      );
      expect(print(filteredQuery.document)).toMatchInlineSnapshot(`
        "{
          entity {
            id
          }
        }"
      `);
    });

    test('preserves the alias of the originally requested field', () => {
      const { makeContext } = buildEntityScenario();
      const query = parse(/* GraphQL */ `
        query {
          entity {
            id
            displayName: name
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        { document: query },
        makeContext(),
        () => {},
      );
      expect(print(filteredQuery.document)).toMatchInlineSnapshot(`
        "{
          entity {
            displayName: name
            id
          }
        }"
      `);
    });

    test('injects every @provides field that was requested, regardless of how many', () => {
      const { makeContext } = buildEntityScenario();
      const query = parse(/* GraphQL */ `
        query {
          entity {
            id
            name
            description
          }
        }
      `);
      const filteredQuery = finalizeGatewayRequest(
        { document: query },
        makeContext(),
        () => {},
      );
      expect(print(filteredQuery.document)).toMatchInlineSnapshot(`
        "{
          entity {
            name
            description
            id
          }
        }"
      `);
    });
  });
});
