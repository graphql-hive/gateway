import { buildSchema, execute, parse, type GraphQLUnionType } from 'graphql';
import { describe, expect, it } from 'vitest';
import { applySemanticIntrospection } from '../src/index.js';

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

  it('stub __search resolver returns an empty list (P3.3 wires the real provider)', async () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __search(query: "anything") { coordinate score cursor }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ __search: [] });
  });

  it('stub __definitions resolver returns an empty list', async () => {
    const schema = buildSchema(`type Query { hello: String }`);
    const extended = applySemanticIntrospection(schema);
    const result = await execute({
      schema: extended,
      document: parse(`{
        __definitions(coordinates: ["Query"]) { __typename }
      }`),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ __definitions: [] });
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
