import type { SchemaCoordinate } from '../../provider.js';
import type { Bm25Document } from './document.js';
import { tokenize } from './tokenizer.js';

/**
 * An inverted index supporting BM25 scoring for schema search.
 * Immutable after construction via {@link Bm25Index.build}.
 *
 * Direct port of HotChocolate's `BM25Index`. Hyperparameters K1 and B are
 * the same standard defaults used by the .NET reference.
 */

/** BM25 term-frequency saturation parameter. */
const K1 = 1.2;

/** BM25 length normalization parameter. */
const B = 0.75;

interface TermPosting {
  readonly documentId: number;
  readonly termFrequency: number;
}

/** A document and its raw BM25 score from a search operation. */
export interface ScoredDocument {
  readonly documentId: number;
  readonly score: number;
}

export class Bm25Index {
  private constructor(
    private readonly invertedIndex: ReadonlyMap<string, readonly TermPosting[]>,
    private readonly documentLengths: readonly number[],
    private readonly averageDocumentLength: number,
    private readonly coordinates: readonly SchemaCoordinate[],
  ) {}

  /** Total number of documents in the index. */
  get documentCount(): number {
    return this.coordinates.length;
  }

  /** Schema coordinate for the given document id. */
  getCoordinate(documentId: number): SchemaCoordinate {
    const coord = this.coordinates[documentId];
    if (coord === undefined) {
      throw new RangeError(`Invalid document id: ${documentId}`);
    }
    return coord;
  }

  /** Build an index over the given documents. */
  static build(documents: readonly Bm25Document[]): Bm25Index {
    const count = documents.length;
    const coordinates: SchemaCoordinate[] = new Array(count);
    const documentLengths: number[] = new Array(count);
    const builder = new Map<string, TermPosting[]>();
    let totalLength = 0;

    for (let documentId = 0; documentId < count; documentId++) {
      const doc = documents[documentId]!;
      coordinates[documentId] = doc.coordinate;

      const tokens = tokenize(doc.text);
      documentLengths[documentId] = tokens.length;
      totalLength += tokens.length;

      // Count term frequencies within this document.
      const termFrequencies = new Map<string, number>();
      for (const token of tokens) {
        termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
      }

      // Append to the inverted index.
      for (const [term, frequency] of termFrequencies) {
        let postings = builder.get(term);
        if (!postings) {
          postings = [];
          builder.set(term, postings);
        }
        postings.push({ documentId, termFrequency: frequency });
      }
    }

    const averageDocumentLength = count > 0 ? totalLength / count : 0;

    return new Bm25Index(
      builder,
      documentLengths,
      averageDocumentLength,
      coordinates,
    );
  }

  /**
   * Search the index with tokenized query terms.
   * Returns scored documents sorted by score descending.
   */
  search(queryTokens: readonly string[]): ScoredDocument[] {
    const count = this.documentCount;
    if (queryTokens.length === 0 || count === 0) {
      return [];
    }

    const scores = new Float64Array(count);

    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token);
      if (!postings) {
        continue;
      }

      // IDF = ln((N - df + 0.5) / (df + 0.5) + 1)
      const df = postings.length;
      const idf = Math.log((count - df + 0.5) / (df + 0.5) + 1);

      for (const posting of postings) {
        const tf = posting.termFrequency;
        const docLen = this.documentLengths[posting.documentId]!;
        const numerator = tf * (K1 + 1);
        const denominator =
          tf +
          K1 *
            (1 -
              B +
              B *
                (this.averageDocumentLength > 0
                  ? docLen / this.averageDocumentLength
                  : 0));
        scores[posting.documentId]! += idf * (numerator / denominator);
      }
    }

    const results: ScoredDocument[] = [];
    for (let i = 0; i < count; i++) {
      const s = scores[i]!;
      if (s > 0) {
        results.push({ documentId: i, score: s });
      }
    }

    // Sort by score descending.
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
