import type { SchemaCoordinate } from '../../provider.js';

/** A single BM25-indexable document: a schema coordinate plus its searchable text. */
export interface Bm25Document {
  coordinate: SchemaCoordinate;
  text: string;
}
