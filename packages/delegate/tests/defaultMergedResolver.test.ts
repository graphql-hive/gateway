import {
  FieldNode,
  GraphQLResolveInfo,
  GraphQLString,
  OperationDefinitionNode,
  parse,
} from 'graphql';
import { describe, expect, it } from 'vitest';
import { defaultMergedResolver } from '../src/defaultMergedResolver.js';
import { annotateExternalObject } from '../src/mergeFields.js';

function infoOf(source: string, fieldName: string): GraphQLResolveInfo {
  const document = parse(source);
  const fieldNodes = [
    (document.definitions[0] as OperationDefinitionNode).selectionSet
      .selections[0] as FieldNode,
  ];
  return {
    fieldName,
    fieldNodes,
    returnType: GraphQLString,
  } as unknown as GraphQLResolveInfo;
}

describe('defaultMergedResolver field name fallback', () => {
  it('resolves by field name when the aliased response key is absent on an external object', () => {
    const parent = annotateExternalObject({ name: 'Local' }, [], undefined, {});
    expect(
      defaultMergedResolver(
        parent,
        {},
        {},
        infoOf('{ fullName: name }', 'name'),
      ),
    ).toBe('Local');
  });

  it('prefers the response key when it is present', () => {
    const parent = annotateExternalObject(
      { name: 'Literal', fullName: 'Aliased' },
      [],
      undefined,
      {},
    );
    expect(
      defaultMergedResolver(
        parent,
        {},
        {},
        infoOf('{ fullName: name }', 'name'),
      ),
    ).toBe('Aliased');
  });

  it('returns undefined when neither response key nor field name is present', () => {
    const parent = annotateExternalObject({ id: '1' }, [], undefined, {});
    expect(
      defaultMergedResolver(
        parent,
        {},
        {},
        infoOf('{ fullName: name }', 'name'),
      ),
    ).toBeUndefined();
  });

  it('resolves non-aliased fields by field name as before', () => {
    const parent = annotateExternalObject({ name: 'Local' }, [], undefined, {});
    expect(
      defaultMergedResolver(parent, {}, {}, infoOf('{ name }', 'name')),
    ).toBe('Local');
  });
});
