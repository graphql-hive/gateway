import {
  MergedTypeResolver,
  StitchingInfo,
  UNPATHED_ERRORS_SYMBOL,
} from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { parseSelectionSet } from '@graphql-tools/utils';
import {
  FieldNode,
  GraphQLResolveInfo,
  Kind,
  OperationDefinitionNode,
  parse,
} from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { resolveLocalFieldResult } from '../src/resolveLocalFieldResult.js';

const schema = makeExecutableSchema({
  typeDefs: /* GraphQL */ `
    type Person {
      id: ID!
      name: String
      surname: String
      friend: Person
    }
    type Query {
      person: Person
    }
  `,
});
const personType = schema.getType('Person')!;

function fieldNodeOf(source: string): FieldNode {
  const document = parse(source);
  return (document.definitions[0] as OperationDefinitionNode).selectionSet
    .selections[0] as FieldNode;
}

function infoOf(source: string): GraphQLResolveInfo {
  return {
    returnType: personType,
    fieldNodes: [fieldNodeOf(source)],
  } as unknown as GraphQLResolveInfo;
}

function stitchingInfoOf(
  entries: Array<{
    subschema: any;
    keySelectionSet: string;
    resolver: any;
  }>,
): StitchingInfo {
  return {
    mergedTypes: {
      Person: {
        typeName: 'Person',
        selectionSets: new Map(
          entries.map((e) => [
            e.subschema,
            parseSelectionSet(e.keySelectionSet),
          ]),
        ),
        resolvers: new Map(entries.map((e) => [e.subschema, e.resolver])),
      },
    },
  } as unknown as StitchingInfo;
}

const info = infoOf('query { person { name surname } }');
const context = {};

describe('resolveLocalFieldResult', () => {
  it('returns the value as-is when it already satisfies the requested selection', () => {
    const resolver = vi.fn();
    const value = { id: '1', name: 'Joe', surname: 'Doe' };
    const result = resolveLocalFieldResult(
      value,
      context,
      info,
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('delegates to the owning subschema when requested fields are missing but a merge key is satisfied', () => {
    const subschema = { name: 'remote' };
    const resolver = vi.fn((value: any) => ({
      ...value,
      name: 'Remote',
      surname: 'RemoteSurname',
    }));
    const value: { id: string; __typename?: string } = { id: '1' };
    const result = resolveLocalFieldResult(
      value,
      context,
      info,
      stitchingInfoOf([{ subschema, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toEqual({
      id: '1',
      __typename: 'Person',
      name: 'Remote',
      surname: 'RemoteSurname',
    });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(
      value,
      context,
      info,
      subschema,
      {
        kind: Kind.SELECTION_SET,
        selections: info.fieldNodes[0]!.selectionSet!.selections,
      },
      undefined,
      personType,
      false,
    );
    // the delegated value needs __typename for entity representations
    expect(value.__typename).toBe('Person');
  });

  it('delegates only the fields missing from the payload', () => {
    const resolver = vi.fn<MergedTypeResolver>(() => ({ surname: 'Remote' }));
    const value = { id: '1', name: 'Stale' };
    const result = resolveLocalFieldResult(
      value,
      context,
      info,
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    // name was already in the payload, only surname gets fetched
    expect(result).toMatchObject({ name: 'Stale', surname: 'Remote' });
    const selectionSet = resolver.mock.calls[0]![4];
    expect(selectionSet.selections).toHaveLength(1);
    expect(selectionSet.selections[0]).toMatchObject({
      name: { value: 'surname' },
    });
  });

  it('returns the value untouched when no merge key is satisfied', () => {
    const resolver = vi.fn();
    const value = { foo: 'bar' };
    const result = resolveLocalFieldResult(
      value,
      context,
      info,
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('returns the value untouched without stitching info', () => {
    const value = { id: '1' };
    expect(resolveLocalFieldResult(value, context, info, null as any)).toBe(
      value,
    );
  });

  it('returns the value untouched when the return type is not merged', () => {
    const resolver = vi.fn();
    const value = { id: '1' };
    const result = resolveLocalFieldResult(value, context, info, {
      mergedTypes: {},
    } as unknown as StitchingInfo);
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('returns already external objects untouched', () => {
    const resolver = vi.fn();
    const value = { id: '1', [UNPATHED_ERRORS_SYMBOL]: [] };
    const result = resolveLocalFieldResult(
      value,
      context,
      info,
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('resolves each item of a list independently', () => {
    const resolver = vi.fn((value: any) => ({ ...value, name: 'Remote' }));
    const complete = { id: '2', name: 'Joe', surname: 'Doe' };
    const result = resolveLocalFieldResult(
      [{ id: '1' }, complete],
      context,
      info,
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result[0].name).toBe('Remote');
    expect(result[1]).toBe(complete);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('passes null and scalar values through', () => {
    const resolver = vi.fn();
    const stitchingInfo = stitchingInfoOf([
      { subschema: {}, keySelectionSet: '{ id }', resolver },
    ]);
    expect(resolveLocalFieldResult(null, context, info, stitchingInfo)).toBe(
      null,
    );
    expect(resolveLocalFieldResult('x', context, info, stitchingInfo)).toBe(
      'x',
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it('counts null leaf fields as satisfied', () => {
    const resolver = vi.fn();
    const value = { id: '1', name: null, surname: 'Doe' };
    const result = resolveLocalFieldResult(
      value,
      context,
      info,
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('counts null composites with a requested sub-selection as unsatisfied', () => {
    const resolver = vi.fn((value: any) => value);
    const value = { id: '1', friend: null };
    resolveLocalFieldResult(
      value,
      context,
      infoOf('query { person { friend { name } } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('bootstraps from a subschema without computed field dependencies', () => {
    const inventory = {
      name: 'inventory',
      merge: { Person: { fields: { surname: { computed: true } } } },
    };
    const products = { name: 'products' };
    const inventoryResolver = vi.fn();
    const productsResolver = vi.fn((value: any) => value);
    resolveLocalFieldResult(
      { id: '1' },
      context,
      info,
      stitchingInfoOf([
        {
          subschema: inventory,
          keySelectionSet: '{ id }',
          resolver: inventoryResolver,
        },
        {
          subschema: products,
          keySelectionSet: '{ id }',
          resolver: productsResolver,
        },
      ]),
    );
    expect(productsResolver).toHaveBeenCalledTimes(1);
    expect(inventoryResolver).not.toHaveBeenCalled();
  });

  it('enables type merging for stitching to resolve other subschemas', async () => {
    const products = { name: 'products' };
    const productsResolver = vi.fn((..._args: unknown[]) => ({
      name: 'Joe',
      surname: 'Doe',
      friend: { id: '2' },
    }));
    const result = await resolveLocalFieldResult(
      { id: '1' },
      context,
      infoOf('query { person { name surname friend { id } } }'),
      stitchingInfoOf([
        {
          subschema: products,
          keySelectionSet: '{ id }',
          resolver: productsResolver,
        },
      ]),
    );
    expect(result).toMatchObject({
      name: 'Joe',
      surname: 'Doe',
      friend: { id: '2' },
    });
    expect(productsResolver.mock.calls[0]![7]).toBe(false);
  });

  it('treats providedFields as resolved locally when checking satisfaction', () => {
    const resolver = vi.fn();
    const value = { id: '1' };
    const result = resolveLocalFieldResult(
      value,
      context,
      infoOf('query { person { id name } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
      new Set(['name']),
    );
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('excludes providedFields from the delegated selection', () => {
    const resolver = vi.fn<MergedTypeResolver>((value) => ({
      ...value,
      surname: 'Remote',
    }));
    resolveLocalFieldResult(
      { id: '1' },
      context,
      info,
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
      new Set(['name']),
    );
    const selectionSet = resolver.mock.calls[0]![4];
    expect(selectionSet.selections).toHaveLength(1);
    expect(selectionSet.selections[0]).toMatchObject({
      name: { value: 'surname' },
    });
  });

  it('keeps payload fields that are outside the delegated selection', () => {
    const resolver = vi.fn(() => ({ name: 'Remote' }));
    const value = { id: '1', local: 'kept' };
    const result = resolveLocalFieldResult(
      value,
      context,
      infoOf('query { person { name } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toMatchObject({
      id: '1',
      local: 'kept',
      name: 'Remote',
    });
  });

  it('matches query aliases against the literal field names of the payload', () => {
    const resolver = vi.fn();
    const value = { id: '1', name: 'Local' };
    const result = resolveLocalFieldResult(
      value,
      context,
      infoOf('query { person { fullName: name } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('keeps the alias in the delegated selection for missing fields', () => {
    const resolver = vi.fn<MergedTypeResolver>(() => ({
      fullName: 'Remote',
    }));
    resolveLocalFieldResult(
      { id: '1' },
      context,
      infoOf('query { person { fullName: name } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    const selectionSet = resolver.mock.calls[0]![4];
    expect(selectionSet.selections[0]).toMatchObject({
      alias: { value: 'fullName' },
      name: { value: 'name' },
    });
  });

  it('keeps only literal field names on the merged result, aliases resolve downstream', () => {
    const resolver = vi.fn<MergedTypeResolver>(() => ({
      familyName: 'Remote',
    }));
    const value = { id: '1', name: 'Local' };
    const result = resolveLocalFieldResult(
      value,
      context,
      infoOf('query { person { fullName: name, familyName: surname } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    // name was already in the payload, only familyName was fetched
    expect(resolver.mock.calls[0]![4].selections).toHaveLength(1);
    // neither the merged result nor the payload ever carry alias keys
    expect(result).toMatchObject({
      name: 'Local',
      familyName: 'Remote',
    });
    expect(result).not.toHaveProperty('fullName');
    expect(value).not.toHaveProperty('fullName');
  });

  it('keeps only literal field names on nested payload objects', () => {
    const resolver = vi.fn(() => ({ friend: { surname: 'Remote' } }));
    const result = resolveLocalFieldResult(
      { id: '1', friend: { id: '2', name: 'LocalFriend' } },
      context,
      infoOf('query { person { friend { nick: name, surname } } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result.friend).toMatchObject({
      name: 'LocalFriend',
      surname: 'Remote',
    });
    expect(result.friend).not.toHaveProperty('nick');
  });

  it('sees through inline fragments in the requested selection', () => {
    const resolver = vi.fn();
    const value = { id: '1', name: 'Joe' };
    const result = resolveLocalFieldResult(
      value,
      context,
      infoOf('query { person { ... on Person { name } } }'),
      stitchingInfoOf([{ subschema: {}, keySelectionSet: '{ id }', resolver }]),
    );
    expect(result).toBe(value);
    expect(resolver).not.toHaveBeenCalled();
  });
});
