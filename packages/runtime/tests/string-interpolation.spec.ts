import {
  getInterpolatedHeadersFactory,
  getInterpolatedStringFactory,
} from '@graphql-mesh/string-interpolation';
import { describe, expect, it } from 'vitest';

describe('@graphql-mesh/string-interpolation Date handling', () => {
  it('serializes Date placeholders as ISO strings', () => {
    const date = new Date('2023-12-31T23:59:59.000Z');
    const interpolatePath = getInterpolatedStringFactory(
      '/api/test-date/{args.dateInPathVariable}',
    );
    const interpolateHeader = getInterpolatedHeadersFactory({
      'request-date': '{args.requestDate}',
    });

    expect(
      interpolatePath({
        env: {},
        args: {
          dateInPathVariable: date,
        },
      }),
    ).toBe('/api/test-date/2023-12-31T23:59:59.000Z');

    expect(
      interpolateHeader({
        env: {},
        args: {
          requestDate: date,
        },
      }),
    ).toEqual({
      'request-date': '2023-12-31T23:59:59.000Z',
    });
  });
});
