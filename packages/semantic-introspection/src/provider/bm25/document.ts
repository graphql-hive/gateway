import type { SchemaCoordinate } from '../../provider.js';

/**
 * A single document in the BM25 search index — maps a schema coordinate
 * to its searchable text content (typically `name + " " + description`).
 *
 * Direct port of HotChocolate's `BM25Document`.
 */
export interface Bm25Document {
  readonly coordinate: SchemaCoordinate;
  readonly text: string;
}
