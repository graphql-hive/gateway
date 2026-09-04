import { buildSchema, execute, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { applySemanticIntrospection } from '../src/index.js';

/** Integration matrix for empty-after-filter across every Kind, plus the non-cascade reference case. */

const KITCHEN_SINK_SDL = /* GraphQL */ `
  type Query {
    ok: String
    staleRef: StaleObject
    deadInputUsage(input: AllDeadInput): String
    legacyTopLevel: String @deprecated(reason: "gone")
  }

  type StaleObject {
    legacy1: String @deprecated(reason: "gone")
    legacy2: Int @deprecated(reason: "gone")
  }

  type HealthyObject {
    name: String!
  }

  input AllDeadInput {
    a: String @deprecated(reason: "gone")
  }

  input HealthyInput {
    name: String
  }

  enum AllDeadEnum {
    A @deprecated(reason: "gone")
    B @deprecated(reason: "gone")
  }

  enum LiveEnum {
    X
    Y @deprecated(reason: "gone")
  }

  interface IDead {
    old: String @deprecated(reason: "gone")
  }

  interface IAlive {
    name: String!
  }

  union UAllDead = StaleObject
  union UMixed = StaleObject | HealthyObject
`;

const DEFINITIONS_QUERY = /* GraphQL */ `
  query ($c: [String!]!) {
    __definitions(coordinates: $c) {
      __typename
      ... on __Type {
        name
      }
      ... on __Field {
        fieldName: name
      }
      ... on __EnumValue {
        name
      }
      ... on __InputValue {
        name
      }
    }
  }
`;

function applyFiltered() {
  return applySemanticIntrospection(buildSchema(KITCHEN_SINK_SDL), {
    excludeDeprecated: true,
  });
}

async function defs(coords: string[]): Promise<Array<Record<string, unknown>>> {
  const result = await execute({
    schema: applyFiltered(),
    document: parse(DEFINITIONS_QUERY),
    variableValues: { c: coords },
  });
  expect(result.errors).toBeUndefined();
  return (result.data as { __definitions: Array<Record<string, unknown>> })
    .__definitions;
}

describe('fixture matrix — empty-after-filter across all Kinds', () => {
  it('omits an Object type whose fields are all @deprecated', async () => {
    const r = await defs(['StaleObject', 'HealthyObject']);
    expect(r).toEqual([{ __typename: '__Type', name: 'HealthyObject' }]);
  });

  it('omits an Input object whose fields are all @deprecated', async () => {
    const r = await defs(['AllDeadInput', 'HealthyInput']);
    expect(r).toEqual([{ __typename: '__Type', name: 'HealthyInput' }]);
  });

  it('omits an Enum whose values are all @deprecated', async () => {
    const r = await defs(['AllDeadEnum', 'LiveEnum']);
    expect(r).toEqual([{ __typename: '__Type', name: 'LiveEnum' }]);
  });

  it('omits an Interface whose fields are all @deprecated', async () => {
    const r = await defs(['IDead', 'IAlive']);
    expect(r).toEqual([{ __typename: '__Type', name: 'IAlive' }]);
  });

  it('omits a Union whose members are all empty; keeps a Union with mixed survivors', async () => {
    const r = await defs(['UAllDead', 'UMixed']);
    expect(r).toEqual([{ __typename: '__Type', name: 'UMixed' }]);
  });

  it('omits deprecated member coordinates (field / enum value / input field)', async () => {
    expect(await defs(['StaleObject.legacy1'])).toEqual([]);
    expect(await defs(['Query.legacyTopLevel'])).toEqual([]);
    expect(await defs(['LiveEnum.Y'])).toEqual([]);
    expect(await defs(['AllDeadInput.a'])).toEqual([]);
  });

  it('keeps a non-deprecated field whose return type is empty-after-filter', async () => {
    // Field stays visible even though StaleObject is opaque to the agent.
    expect(await defs(['Query.staleRef'])).toEqual([
      { __typename: '__Field', fieldName: 'staleRef' },
    ]);
  });

  it('keeps a non-deprecated field whose arg type is empty-after-filter', async () => {
    expect(await defs(['Query.deadInputUsage'])).toEqual([
      { __typename: '__Field', fieldName: 'deadInputUsage' },
    ]);
  });

  it('__search excludes deprecated coordinates across every Kind', async () => {
    const extended = applyFiltered();
    const result = await execute({
      schema: extended,
      document: parse(
        `{ __search(query: "legacy old gone", first: 100) { coordinate } }`,
      ),
    });
    expect(result.errors).toBeUndefined();
    const coords = (
      result.data as { __search: Array<{ coordinate: string }> }
    ).__search.map((r) => r.coordinate);
    // Deprecated member coords never appear.
    expect(coords).not.toContain('StaleObject.legacy1');
    expect(coords).not.toContain('StaleObject.legacy2');
    expect(coords).not.toContain('Query.legacyTopLevel');
    expect(coords).not.toContain('AllDeadInput.a');
    expect(coords).not.toContain('LiveEnum.Y');
    expect(coords).not.toContain('AllDeadEnum.A');
    expect(coords).not.toContain('AllDeadEnum.B');
    expect(coords).not.toContain('IDead.old');
  });

  it('standard __schema introspection still returns the full underlying schema', async () => {
    const extended = applyFiltered();
    const result = await execute({
      schema: extended,
      document: parse(`{
        __type(name: "StaleObject") {
          fields(includeDeprecated: true) { name isDeprecated }
        }
      }`),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __type: { fields: Array<{ name: string; isDeprecated: boolean }> };
    };
    expect(data.__type.fields.map((f) => f.name).sort()).toEqual([
      'legacy1',
      'legacy2',
    ]);
    expect(data.__type.fields.every((f) => f.isDeprecated)).toBe(true);
  });
});
