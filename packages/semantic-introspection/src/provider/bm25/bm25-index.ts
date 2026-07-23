import type { SchemaCoordinate } from '../../provider.js';
import type { Bm25Document } from './document.js';
import { tokenize } from './tokenizer.js';

// BM25 defaults.
const K1 = 1.2;
const B = 0.75;

interface TermPosting {
  documentId: number;
  termFrequency: number;
}

/** A document id paired with its raw BM25 score from a search. */
export interface ScoredDocument {
  documentId: number;
  score: number;
}

/** Inverted index supporting BM25 scoring over a fixed set of documents. */
export class Bm25Index {
  private readonly invertedIndex: Map<string, TermPosting[]>;
  private readonly documentLengths: number[];
  private readonly averageDocumentLength: number;
  private readonly coordinates: SchemaCoordinate[];

  constructor(documents: readonly Bm25Document[]) {
    const count = documents.length;
    const coordinates: SchemaCoordinate[] = new Array(count);
    const documentLengths: number[] = new Array(count);
    const invertedIndex = new Map<string, TermPosting[]>();
    let totalLength = 0;

    for (let documentId = 0; documentId < count; documentId++) {
      const doc = documents[documentId]!;
      coordinates[documentId] = doc.coordinate;

      const tokens = tokenize(doc.text);
      documentLengths[documentId] = tokens.length;
      totalLength += tokens.length;

      const termFrequencies = new Map<string, number>();
      for (const token of tokens) {
        termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
      }

      for (const [term, frequency] of termFrequencies) {
        let postings = invertedIndex.get(term);
        if (!postings) {
          postings = [];
          invertedIndex.set(term, postings);
        }
        postings.push({ documentId, termFrequency: frequency });
      }
    }

    this.invertedIndex = invertedIndex;
    this.documentLengths = documentLengths;
    this.averageDocumentLength = count > 0 ? totalLength / count : 0;
    this.coordinates = coordinates;
  }

  get documentCount(): number {
    return this.coordinates.length;
  }

  getCoordinate(documentId: number): SchemaCoordinate {
    const coord = this.coordinates[documentId];
    if (coord === undefined) {
      throw new RangeError(`Invalid document id: ${documentId}`);
    }
    return coord;
  }

  /** Score and rank documents against `queryTokens`. Returns sorted descending; documents with score 0 are omitted. */
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
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
