import { describe, expect, it } from 'vitest';
import { entryPointAppliesToParent } from '../src/entryPointAppliesToParent.js';

describe('entryPointAppliesToParent', () => {
  it('rejects missing top-level keys', () => {
    expect(
      entryPointAppliesToParent(
        { selectionSet: '{ upc }' },
        { upc: undefined },
      ),
    ).toBe(false);
    expect(
      entryPointAppliesToParent({ selectionSet: '{ upc }' }, { upc: '1' }),
    ).toBe(true);
  });

  it('requires nested key fields before selecting an entry', () => {
    expect(
      entryPointAppliesToParent(
        { selectionSet: '{ organization { id } }' },
        { organization: {}, upc: '1' },
      ),
    ).toBe(false);
    expect(
      entryPointAppliesToParent(
        { selectionSet: '{ organization { id } }' },
        { organization: { id: 'org-1' } },
      ),
    ).toBe(true);
    expect(
      entryPointAppliesToParent(
        { selectionSet: '{ upc }' },
        { organization: {}, upc: '1' },
      ),
    ).toBe(true);
  });
});
