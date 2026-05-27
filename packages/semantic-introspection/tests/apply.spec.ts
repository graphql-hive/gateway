import { buildSchema, execute, parse, type GraphQLUnionType } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  applySemanticIntrospection,
  type SchemaSearchProvider,
} from '../src/index.js';

describe('applySemanticIntrospection', () => {
  it('adds __search and __definitions fields to the query type', () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);
    const fields = extended.getQueryType()!.getFields();
    expect(fields['__search']).toBeDefined();
    expect(fields['__definitions']).toBeDefined();
  });

  it('adds the __SearchResult type and __SchemaDefinition union', () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);

    expect(extended.getType('__SearchResult')).toBeDefined();

    const union = extended.getType('__SchemaDefinition') as GraphQLUnionType;
    expect(union).toBeDefined();
    const members = union.getTypes().map((t) => t.name);
    expect(members).toEqual([
      '__Type',
      '__Field',
      '__InputValue',
      '__EnumValue',
      '__Directive',
    ]);
  });

  it('preserves the original query fields', () => {
    const schema = buildSchema(`
      type Query {
        hello: String
        greeting: String
      }
    `);
    const extended = applySemanticIntrospection(schema);
    const fields = extended.getQueryType()!.getFields();
    expect(fields['hello']).toBeDefined();
    expect(fields['greeting']).toBeDefined();
  });

  it('respects a custom query type name', () => {
    const schema = buildSchema(`
      schema { query: RootQuery }
      type RootQuery { hello: String }
    `);
    const extended = applySemanticIntrospection(schema);
    expect(extended.getQueryType()!.name).toBe('RootQuery');
    expect(extended.getQueryType()!.getFields()['__search']).toBeDefined();
  });

  it('throws when the input schema has no query type', () => {
    // A schema with only a mutation type has no query — invalid per spec but
    // technically constructible; we surface a clean error rather than throw
    // a downstream "Cannot read property 'name' of undefined".
    const schema = buildSchema(`
      type Mutation { noop: Boolean }
      schema { mutation: Mutation }
    `);
    expect(() => applySemanticIntrospection(schema)).toThrow(
      /must define a query type/,
    );
  });

  it('does not mutate the input schema', () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const before = Object.keys(schema.getQueryType()!.getFields()).sort();
    applySemanticIntrospection(schema);
    const after = Object.keys(schema.getQueryType()!.getFields()).sort();
    expect(after).toEqual(before);
  });

  it('__search returns coordinates matching the host schema (default BM25 provider)', async () => {
    const schema = buildSchema(`
      type Query {
        user(id: ID!): User
        posts: [Post!]!
      }
      type User { id: ID!  email: String! }
      type Post { id: ID!  title: String! }
    `);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __search(query: "user email") {
          coordinate
          score
          cursor
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as { __search: Array<{ coordinate: string }> };
    expect(data.__search.map((r) => r.coordinate)).toContain('User.email');
  });

  it('__search resolves nested `definition` via the __SchemaDefinition union', async () => {
    const schema = buildSchema(`
      type Query { user: User }
      type User { id: ID!  email: String! }
    `);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __search(query: "User") {
          coordinate
          definition {
            __typename
            ... on __Type { name kind }
          }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __search: Array<{
        coordinate: string;
        definition: { __typename: string; name?: string; kind?: string };
      }>;
    };
    const userHit = data.__search.find((r) => r.coordinate === 'User');
    expect(userHit).toBeDefined();
    expect(userHit!.definition.__typename).toBe('__Type');
    expect(userHit!.definition.name).toBe('User');
    expect(userHit!.definition.kind).toBe('OBJECT');
  });

  it('__search resolves nested `pathsToRoot` via the provider', async () => {
    const schema = buildSchema(`
      type Query { user(id: ID!): User }
      type User { id: ID!  email: String! }
    `);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __search(query: "email") {
          coordinate
          pathsToRoot
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __search: Array<{ coordinate: string; pathsToRoot: string[][] }>;
    };
    const hit = data.__search.find((r) => r.coordinate === 'User.email');
    expect(hit).toBeDefined();
    expect(hit!.pathsToRoot).toContainEqual(['Query.user', 'User.email']);
  });

  it('__definitions resolves a type-only coordinate to a __Type', async () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __definitions(coordinates: ["Query"]) {
          __typename
          ... on __Type { name kind }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      __definitions: [{ __typename: '__Type', name: 'Query', kind: 'OBJECT' }],
    });
  });

  it('__definitions resolves a field coordinate to a __Field', async () => {
    const schema = buildSchema(`
      type Query { user(id: ID!): User }
      type User { id: ID! }
    `);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __definitions(coordinates: ["Query.user"]) {
          __typename
          ... on __Field { name  args { name } }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __definitions: Array<{
        __typename: string;
        name: string;
        args: Array<{ name: string }>;
      }>;
    };
    expect(data.__definitions).toHaveLength(1);
    expect(data.__definitions[0]!.__typename).toBe('__Field');
    expect(data.__definitions[0]!.name).toBe('user');
    expect(data.__definitions[0]!.args.map((a) => a.name)).toEqual(['id']);
  });

  it('__definitions resolves an enum value to a __EnumValue', async () => {
    const schema = buildSchema(`
      type Query { _: Boolean }
      enum Role { ADMIN GUEST }
    `);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __definitions(coordinates: ["Role.ADMIN"]) {
          __typename
          ... on __EnumValue { name }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      __definitions: [{ __typename: '__EnumValue', name: 'ADMIN' }],
    });
  });

  it('__definitions resolves an input-object field to a __InputValue', async () => {
    const schema = buildSchema(`
      type Query { _: Boolean }
      input UserFilter { name: String }
    `);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __definitions(coordinates: ["UserFilter.name"]) {
          __typename
          ... on __InputValue { name }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      __definitions: [{ __typename: '__InputValue', name: 'name' }],
    });
  });

  it('__definitions resolves an @-prefixed coordinate to a __Directive', async () => {
    const schema = buildSchema(`type Query { _: Boolean }`);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __definitions(coordinates: ["@deprecated"]) {
          __typename
          ... on __Directive { name }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      __definitions: [{ __typename: '__Directive', name: 'deprecated' }],
    });
  });

  it('__definitions silently skips unknown coordinates (omitted from the result list)', async () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __definitions(coordinates: ["Query", "Bogus", "Query.hello"]) {
          __typename
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as { __definitions: unknown[] };
    // "Bogus" is omitted; only two valid coordinates resolve.
    expect(data.__definitions).toHaveLength(2);
  });

  describe('excludeDeprecated', () => {
    const SDL = /* GraphQL */ `
      type Query {
        ok: String
        staleRef: Stale
      }
      type Stale {
        legacyA: String @deprecated(reason: "gone")
        legacyB: Int @deprecated(reason: "gone")
      }
      type Healthy {
        name: String!
      }
    `;

    it('__definitions omits an empty-after-filter type entirely', async () => {
      const extended = applySemanticIntrospection(buildSchema(SDL), {
        excludeDeprecated: true,
      });
      const result = await execute({
        schema: extended,
        document: parse(`{
          __definitions(coordinates: ["Stale", "Healthy"]) {
            __typename
            ... on __Type { name }
          }
        }`),
      });
      expect(result.errors).toBeUndefined();
      // Stale is empty-after-filter → omitted. Healthy survives.
      expect(result.data).toEqual({
        __definitions: [{ __typename: '__Type', name: 'Healthy' }],
      });
    });

    it('__definitions omits a coordinate whose value is a deprecated member', async () => {
      const extended = applySemanticIntrospection(buildSchema(SDL), {
        excludeDeprecated: true,
      });
      const result = await execute({
        schema: extended,
        document: parse(`{
          __definitions(coordinates: ["Stale.legacyA"]) {
            __typename
          }
        }`),
      });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ __definitions: [] });
    });

    it('__definitions DOES return a non-deprecated field whose return type is empty-after-filter (non-cascade)', async () => {
      // Query.staleRef returns Stale (empty after filter), but staleRef
      // itself is not deprecated, so it stays visible. Agent sees a field
      // with an effectively opaque return type — the locked design choice.
      const extended = applySemanticIntrospection(buildSchema(SDL), {
        excludeDeprecated: true,
      });
      const result = await execute({
        schema: extended,
        document: parse(`{
          __definitions(coordinates: ["Query.staleRef"]) {
            __typename
            ... on __Field { name }
          }
        }`),
      });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        __definitions: [{ __typename: '__Field', name: 'staleRef' }],
      });
    });

    it('standard __schema introspection is unaffected — still returns the deprecated field', async () => {
      const extended = applySemanticIntrospection(buildSchema(SDL), {
        excludeDeprecated: true,
      });
      const result = await execute({
        schema: extended,
        document: parse(`{
          __type(name: "Stale") {
            fields(includeDeprecated: true) { name isDeprecated }
          }
        }`),
      });
      expect(result.errors).toBeUndefined();
      const data = result.data as {
        __type: { fields: Array<{ name: string; isDeprecated: boolean }> };
      };
      const names = data.__type.fields.map((f) => f.name).sort();
      expect(names).toEqual(['legacyA', 'legacyB']);
      expect(data.__type.fields.every((f) => f.isDeprecated)).toBe(true);
    });
  });

  it('uses a custom provider when one is supplied via options', async () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const seenCalls: Array<{ method: string; args: unknown[] }> = [];
    const customProvider: SchemaSearchProvider = {
      async search(query, first, after, minScore) {
        seenCalls.push({
          method: 'search',
          args: [query, first, after, minScore],
        });
        return [{ coordinate: 'Custom', score: 0.42, cursor: 'cursor0' }];
      },
      async getPathsToRoot(coordinate) {
        seenCalls.push({ method: 'getPathsToRoot', args: [coordinate] });
        return [];
      },
    };
    const extended = applySemanticIntrospection(schema, {
      provider: customProvider,
    });
    const result = await execute({
      schema: extended,
      document: parse(`{
        __search(query: "anything") { coordinate score cursor }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      __search: [{ coordinate: 'Custom', score: 0.42, cursor: 'cursor0' }],
    });
    // `first` defaults to 10 per SDL default; `after`/`minScore` default to null.
    expect(seenCalls).toContainEqual({
      method: 'search',
      args: ['anything', 10, null, null],
    });
  });

  it('standard introspection still sees the host schema (and is unaffected by deprecated filter — for later phases)', async () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __schema { queryType { name } }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      __schema: { queryType: { name: 'Query' } },
    });
  });
});
