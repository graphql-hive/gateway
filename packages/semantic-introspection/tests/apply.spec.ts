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

  it('throws when applied to a schema that already defines __SearchResult or __SchemaDefinition as a type', () => {
    // `assumeValid: true` is required to construct a host schema whose
    // user-defined type uses the `__` prefix — graphql-js rejects it
    // otherwise. Without the type-level collision guard,
    // `extendSchema(..., { assumeValid: true })` would silently produce
    // a duplicate-extension schema.
    const schema = buildSchema(
      /* GraphQL */ `
        type Query {
          hello: String
        }
        type __SearchResult {
          coordinate: String
        }
      `,
      { assumeValid: true },
    );
    expect(() => applySemanticIntrospection(schema)).toThrow(
      /already defines `__SearchResult` as a type/,
    );
  });

  it('throws when applied to a schema that already has __search or __definitions', () => {
    // Most direct reproduction: double application. The second call
    // sees the already-extended schema and must refuse rather than
    // silently duplicate-extending under `assumeValid: true`.
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);
    expect(() => applySemanticIntrospection(extended)).toThrow(
      /already defines `__search` or `__definitions`/,
    );
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

  it('__search returns coordinates matching the host schema', async () => {
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

    it('returns a non-deprecated field whose return type is empty-after-filter', async () => {
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

    it('__search drops empty-after-filter coordinates so non-null `definition` never resolves null', async () => {
      // The default indexer always indexes the type document, so `Stale`
      // is a search candidate. With `excludeDeprecated: true` it becomes
      // empty-after-filter, and `__SearchResult.definition` (non-null)
      // would null-propagate without resolver-layer filtering.
      const extended = applySemanticIntrospection(buildSchema(SDL), {
        excludeDeprecated: true,
      });
      const result = await execute({
        schema: extended,
        document: parse(`{
          __search(query: "Stale Healthy") {
            coordinate
            definition {
              __typename
              ... on __Type { name }
            }
          }
        }`),
      });
      expect(result.errors).toBeUndefined();
      const data = result.data as {
        __search: Array<{
          coordinate: string;
          definition: { __typename: string; name?: string };
        }>;
      };
      // `Stale` is dropped at the search-resolver layer; `Healthy` survives.
      const coords = data.__search.map((r) => r.coordinate);
      expect(coords).not.toContain('Stale');
      expect(coords).toContain('Healthy');
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
        if (after !== null) return []; // single-page mock
        return [{ coordinate: 'Query.hello', score: 0.42, cursor: 'cursor0' }];
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
      __search: [{ coordinate: 'Query.hello', score: 0.42, cursor: 'cursor0' }],
    });
    // `first` defaults to 10 per SDL default; `after`/`minScore` default to null.
    expect(seenCalls).toContainEqual({
      method: 'search',
      args: ['anything', 10, null, null],
    });
  });

  it('keeps paginating internally when a whole provider page is filtered out', async () => {
    // Without the loop, the resolver returns [] for the first call and
    // the client has no cursor to advance — later valid hits are lost.
    const schema = buildSchema(`type Query { hello: String  world: String }`);
    let callCount = 0;
    const customProvider: SchemaSearchProvider = {
      async search(_query, first, after) {
        callCount++;
        if (after === null) {
          // First page: all bogus, all will be filtered.
          return [
            { coordinate: 'Bogus.one', score: 1, cursor: 'cursor-after-1' },
            { coordinate: 'Bogus.two', score: 0.9, cursor: 'cursor-after-2' },
          ];
        }
        if (after === 'cursor-after-2') {
          // Second page: real coordinates.
          return [
            { coordinate: 'Query.hello', score: 0.8, cursor: 'cursor-after-3' },
            { coordinate: 'Query.world', score: 0.7, cursor: 'cursor-after-4' },
          ].slice(0, first);
        }
        return [];
      },
      async getPathsToRoot() {
        return [];
      },
    };
    const extended = applySemanticIntrospection(schema, {
      provider: customProvider,
    });
    const result = await execute({
      schema: extended,
      document: parse(`{
        __search(query: "x", first: 2) { coordinate }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(callCount).toBeGreaterThanOrEqual(2);
    const data = result.data as {
      __search: Array<{ coordinate: string }>;
    };
    expect(data.__search.map((r) => r.coordinate)).toEqual([
      'Query.hello',
      'Query.world',
    ]);
  });

  it('caps internal pagination loops so a non-advancing provider cannot hang', async () => {
    const schema = buildSchema(`type Query { hello: String }`);
    let callCount = 0;
    const stuckProvider: SchemaSearchProvider = {
      async search() {
        callCount++;
        // Same cursor every time — non-advancing.
        return [{ coordinate: 'Bogus.coord', score: 1, cursor: 'same-cursor' }];
      },
      async getPathsToRoot() {
        return [];
      },
    };
    const extended = applySemanticIntrospection(schema, {
      provider: stuckProvider,
    });
    const result = await execute({
      schema: extended,
      document: parse(`{ __search(query: "x") { coordinate } }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ __search: [] });
    // Should break after the second call when it notices the cursor
    // didn't change. Generous upper bound for resilience.
    expect(callCount).toBeLessThanOrEqual(3);
  });

  it('filters provider results whose coordinate does not resolve in the schema', async () => {
    // Hardens the non-null `__SearchResult.definition` contract against
    // misbehaving providers that return synthetic / stale coordinates.
    const schema = buildSchema(`type Query { hello: String }`);
    const customProvider: SchemaSearchProvider = {
      async search(_q, _first, after) {
        if (after !== null) return []; // single-page mock
        return [
          { coordinate: 'Query.hello', score: 1, cursor: 'c0' },
          { coordinate: 'Bogus.coord', score: 0.5, cursor: 'c1' },
        ];
      },
      async getPathsToRoot() {
        return [];
      },
    };
    const extended = applySemanticIntrospection(schema, {
      provider: customProvider,
    });
    const result = await execute({
      schema: extended,
      document: parse(`{
        __search(query: "x") {
          coordinate
          definition { __typename }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __search: Array<{ coordinate: string }>;
    };
    expect(data.__search.map((r) => r.coordinate)).toEqual(['Query.hello']);
  });

  it('leaves standard introspection unaffected by the deprecated filter', async () => {
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
