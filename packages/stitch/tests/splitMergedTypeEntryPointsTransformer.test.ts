import { makeExecutableSchema } from '@graphql-tools/schema';
import { splitMergedTypeEntryPointsTransformer } from '@graphql-tools/stitch';
import { assertSome } from '@graphql-tools/utils';
import { describe, expect, it } from 'vitest';

const schema = makeExecutableSchema({ typeDefs: 'type Query { go:Int }' });

describe('splitMergedTypeEntryPointsTransformer', () => {
  it('applies merged type config entryPoints', () => {
    const results = splitMergedTypeEntryPointsTransformer({
      schema,
      merge: {
        Product: {
          entryPoints: [
            {
              selectionSet: '{ yep }',
              fieldName: 'yep',
            },
          ],
        },
      },
    });

    expect(results.length).toEqual(1);
    assertSome(results[0]?.merge);
    expect(results[0]?.merge['Product']).toEqual({
      selectionSet: '{ yep }',
      fieldName: 'yep',
    });
  });

  it('raises for entryPoints with selectionSet, fieldName, or resolver', () => {
    expect(() => {
      splitMergedTypeEntryPointsTransformer({
        schema,
        merge: {
          Product: {
            entryPoints: [{ selectionSet: '{ yep }', fieldName: 'yep' }],
            selectionSet: '{ nope }',
          },
        },
      });
    }).toThrow();

    expect(() => {
      splitMergedTypeEntryPointsTransformer({
        schema,
        merge: {
          Product: {
            entryPoints: [{ selectionSet: '{ yep }', fieldName: 'yep' }],
            fieldName: 'thing',
          },
        },
      });
    }).toThrow();

    expect(() => {
      splitMergedTypeEntryPointsTransformer({
        schema,
        merge: {
          Product: {
            entryPoints: [{ resolve: () => null }],
            resolve: () => null,
          },
        },
      });
    }).toThrow();
  });

  it('keeps multiple entryPoints on one subschema (no clones)', () => {
    const results = splitMergedTypeEntryPointsTransformer({
      schema,
      merge: {
        Product: {
          entryPoints: [
            {
              selectionSet: '{ id }',
              fieldName: 'productById',
            },
            {
              selectionSet: '{ upc }',
              fieldName: 'productByUpc',
            },
          ],
        },
      },
    });

    expect(results.length).toEqual(1);
    assertSome(results[0]?.merge);
    expect(results[0]?.merge['Product']).toEqual({
      entryPoints: [
        {
          selectionSet: '{ id }',
          fieldName: 'productById',
        },
        {
          selectionSet: '{ upc }',
          fieldName: 'productByUpc',
        },
      ],
    });
  });

  it('flattens single entryPoints and keeps multi-entry types together', () => {
    const results = splitMergedTypeEntryPointsTransformer({
      schema,
      merge: {
        Product: {
          entryPoints: [
            {
              selectionSet: '{ id }',
              fieldName: 'productById',
            },
            {
              selectionSet: '{ upc }',
              fieldName: 'productByUpc',
            },
            {
              selectionSet: '{ key }',
              fieldName: 'productByKey',
            },
          ],
        },
        Video: {
          entryPoints: [
            {
              selectionSet: '{ id }',
              fieldName: 'videoById',
            },
            {
              selectionSet: '{ key }',
              fieldName: 'videoByKey',
            },
          ],
          fields: {
            duration: { canonical: true },
          },
          canonical: true,
        },
        User: {
          entryPoints: [
            {
              selectionSet: '{ id }',
              fieldName: 'userById',
            },
          ],
        },
        Thing: {
          selectionSet: '{ id }',
          fieldName: 'thingById',
        },
      },
    });

    expect(results.length).toEqual(1);
    expect(results[0]?.merge).toEqual({
      Product: {
        entryPoints: [
          {
            selectionSet: '{ id }',
            fieldName: 'productById',
          },
          {
            selectionSet: '{ upc }',
            fieldName: 'productByUpc',
          },
          {
            selectionSet: '{ key }',
            fieldName: 'productByKey',
          },
        ],
      },
      Video: {
        entryPoints: [
          {
            selectionSet: '{ id }',
            fieldName: 'videoById',
          },
          {
            selectionSet: '{ key }',
            fieldName: 'videoByKey',
          },
        ],
        fields: {
          duration: { canonical: true },
        },
        canonical: true,
      },
      User: {
        selectionSet: '{ id }',
        fieldName: 'userById',
      },
      Thing: {
        selectionSet: '{ id }',
        fieldName: 'thingById',
      },
    });
  });
});
