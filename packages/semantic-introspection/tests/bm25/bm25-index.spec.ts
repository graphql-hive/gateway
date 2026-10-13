import { describe, expect, it } from 'vitest';
import { Bm25Index } from '../../src/provider/bm25/bm25-index.js';

describe('Bm25Index', () => {
  it('reports documentCount and resolves coordinates', () => {
    const index = new Bm25Index([
      { coordinate: 'A', text: 'alpha' },
      { coordinate: 'B', text: 'bravo' },
    ]);
    expect(index.documentCount).toBe(2);
    expect(index.getCoordinate(0)).toBe('A');
    expect(index.getCoordinate(1)).toBe('B');
  });

  it('throws on out-of-range coordinate lookup', () => {
    const index = new Bm25Index([{ coordinate: 'A', text: 'alpha' }]);
    expect(() => index.getCoordinate(7)).toThrow(/Invalid document id/);
  });

  it('returns empty results for an empty index or empty query', () => {
    expect(new Bm25Index([]).search(['anything'])).toEqual([]);
    const index = new Bm25Index([{ coordinate: 'A', text: 'alpha' }]);
    expect(index.search([])).toEqual([]);
  });

  it('returns no results when no token matches', () => {
    const index = new Bm25Index([{ coordinate: 'A', text: 'alpha beta' }]);
    expect(index.search(['gamma'])).toEqual([]);
  });

  it('returns the only matching document for a single-token query', () => {
    const index = new Bm25Index([
      { coordinate: 'A', text: 'alpha' },
      { coordinate: 'B', text: 'bravo' },
    ]);
    const results = index.search(['alpha']);
    expect(results).toHaveLength(1);
    expect(results[0]!.documentId).toBe(0);
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it('sorts results by score descending', () => {
    const index = new Bm25Index([
      { coordinate: 'A', text: 'alpha beta gamma' },
      { coordinate: 'B', text: 'alpha alpha alpha' }, // higher TF on `alpha`
      { coordinate: 'C', text: 'delta' },
    ]);
    const results = index.search(['alpha']);
    expect(results.map((r) => r.documentId)).toEqual([1, 0]);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('boosts rarer terms via IDF (a unique-term match beats a common-term match)', () => {
    // `common` appears in every doc → low IDF.
    // `rare`   appears in just one  → high IDF.
    const index = new Bm25Index([
      { coordinate: 'A', text: 'common common common' },
      { coordinate: 'B', text: 'common' },
      { coordinate: 'C', text: 'common rare' },
    ]);
    const commonResults = index.search(['common']);
    const rareResults = index.search(['rare']);
    expect(rareResults).toHaveLength(1);
    expect(rareResults[0]!.documentId).toBe(2);
    // The rare-term hit on C should outrank any common-term hit.
    expect(rareResults[0]!.score).toBeGreaterThan(commonResults[0]!.score);
  });

  it('accumulates scores across multiple query tokens', () => {
    const index = new Bm25Index([
      { coordinate: 'A', text: 'alpha bravo' },
      { coordinate: 'B', text: 'alpha' },
    ]);
    const single = index.search(['alpha']);
    const multi = index.search(['alpha', 'bravo']);
    // Doc A matches both query tokens; doc B matches only one.
    const aSingle = single.find((r) => r.documentId === 0)!.score;
    const aMulti = multi.find((r) => r.documentId === 0)!.score;
    expect(aMulti).toBeGreaterThan(aSingle);
  });
});
