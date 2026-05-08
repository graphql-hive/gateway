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
      // The provided fields (`name`, `description`) are listed on `Entity`
      // here so that the finalized subgraph document remains valid against
      // `targetSchema`; in a real federation setup the providing subgraph's
      // schema would declare them as `@external`. Keeping them on the test
      // schema lets the snapshots catch schema-validity regressions that
      // would silently slip through if the type had only `id`.
      const targetSchema = buildSchema(/* GraphQL */ `
        type Query {
          entity: Entity
        }

        type Entity {
          id: ID!
          name: String
          description: String
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
            id
            name
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
            id
            displayName: name
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
            id
            name
            description
          }
        }"
      `);
    });

    // When two concrete implementations of an interface declare the same
    // field with different nullabilities, the gateway rewrites one of the
    // two with a synthetic `_nullable_` / `_nonNullable_` alias so the
    // outgoing subgraph query stays valid under
    // OverlappingFieldsCanBeMerged. The `@provides` injection step must
    // still find the user's original selection set when looking up by the
    // post-rewrite path; otherwise the providing branch silently drops
    // requested fields. The fallback path lookup keyed by field name (not
    // alias) is what makes this work.
    test('still resolves @provides when the field is rewritten with a synthetic _nullable_ alias', () => {
      const targetSchema = buildSchema(/* GraphQL */ `
        type Query {
          thing: Thing
        }

        interface Thing {
          id: ID!
        }

        type ConcreteA implements Thing {
          id: ID!
          entity: Entity!
        }

        type ConcreteB implements Thing {
          id: ID!
          entity: Entity
        }

        type Entity {
          id: ID!
          name: String
          description: String
        }
      `);

      const subschema = {} as any;
      const providedSelectionSet = (
        parse(/* GraphQL */ `
          {
            name
            description
          }
        `).definitions[0] as any
      ).selectionSet;
      const providedSelectionsByField = new Map([
        [
          subschema,
          {
            entity: providedSelectionSet,
          },
        ],
      ]);
      const context = {
        targetSchema,
        subschema,
        info: {
          schema: {
            extensions: {
              stitchingInfo: {
                mergedTypes: {
                  ConcreteA: { providedSelectionsByField },
                  ConcreteB: { providedSelectionsByField },
                },
              },
            },
          },
        },
      } as unknown as DelegationContext;

      const query = parse(/* GraphQL */ `
        query {
          thing {
            ... on ConcreteA {
              entity {
                id
                description
              }
            }
            ... on ConcreteB {
              entity {
                id
                description
              }
            }
          }
        }
      `);

      let aliasRewriteCount = 0;
      const filteredQuery = finalizeGatewayRequest(
        { document: query },
        context,
        () => {
          aliasRewriteCount++;
        },
      );

      // Sanity check: the alias rewrite was actually triggered, otherwise
      // this test no longer covers the fallback path.
      expect(aliasRewriteCount).toBeGreaterThan(0);

      const printed = print(filteredQuery.document);
      // The alias appears on the nullable branch.
      expect(printed).toMatch(/_nullable_entity:\s*entity/);
      // The aliased branch still receives the requested @provides field
      // (`description`), proving the lookup found the original selection
      // set via the field-name fallback rather than the synthetic alias.
      const aliasMatch = printed.match(
        /_nullable_entity:\s*entity\s*\{([^}]*)\}/,
      );
      expect(aliasMatch?.[1]).toMatch(/\bdescription\b/);
      // And the unrequested @provides field (`name`) must NOT have been
      // injected on either branch.
      expect(printed).not.toMatch(/(?<!__type)\bname\b/);
    });
  });
});
