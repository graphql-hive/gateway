import { applySchemaTransforms } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  HoistField,
  RenameObjectFields,
  TransformQuery,
} from '@graphql-tools/wrap';
import { Kind } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  getHoistFieldMeta,
  resolveSourceFieldName,
} from '../src/resolveSourceFieldName.js';

/**
 * Incremental patch rewriting duck-types TransformQuery / HoistField instance
 * fields (TS `private` is erased at runtime). Fail loudly if those shapes
 * change so deferred path/typename rewrites do not silently break.
 */
describe('transform shapes used by deferred patch rewriting', () => {
  it('TransformQuery exposes path and errorPathTransformer', () => {
    const transform = new TransformQuery({
      path: ['booksByUserIds'],
      queryTransformer: (selectionSet) =>
        selectionSet ?? {
          kind: Kind.SELECTION_SET,
          selections: [],
        },
      errorPathTransformer: (path) => path.filter((p) => p !== 'books'),
    });
    const shape = transform as unknown as {
      path?: string[];
      errorPathTransformer?: (
        p: ReadonlyArray<string | number>,
      ) => Array<string | number>;
    };
    expect(shape.path).toEqual(['booksByUserIds']);
    expect(typeof shape.errorPathTransformer).toBe('function');
    expect(shape.errorPathTransformer?.([0, 'books', 1])).toEqual([0, 1]);
  });

  it('HoistField exposes typeName / newFieldName / pathToField', () => {
    // Last path segment is the old field name; preceding segments are pathToField.
    const transform = new HoistField(
      'Product',
      ['details', 'blurb'],
      'productBlurb',
    );
    const meta = getHoistFieldMeta(
      { transforms: [transform] } as any,
      'Product',
      'productBlurb',
    );
    expect(meta).toMatchObject({
      typeName: 'Product',
      newFieldName: 'productBlurb',
      oldFieldName: 'blurb',
      pathToField: ['details'],
    });
  });

  it('RenameObjectFields mapping is readable after transformSchema', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Product {
          title: String
        }
        type Query {
          product: Product
        }
      `,
    });
    const transform = new RenameObjectFields((typeName, fieldName) =>
      typeName === 'Product' && fieldName === 'title' ? 'name' : fieldName,
    );
    applySchemaTransforms(schema, {
      schema,
      transforms: [transform],
    } as any);
    expect(
      resolveSourceFieldName(
        { transforms: [transform] } as any,
        'Product',
        'name',
      ),
    ).toBe('title');
  });
});
