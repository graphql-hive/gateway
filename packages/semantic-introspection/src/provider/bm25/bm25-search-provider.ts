import type { GraphQLSchema } from 'graphql';
import type {
  SchemaCoordinate,
  SchemaCoordinatePath,
  SchemaSearchProvider,
  SchemaSearchResult,
} from '../../provider.js';
import { Bm25Index } from './bm25-index.js';
import { indexSchema, type SchemaIndexerOptions } from './schema-indexer.js';
import { tokenize } from './tokenizer.js';

/** Maximum length, in characters, of an accepted query string. */
const MAX_QUERY_LENGTH = 1024;

/** Maximum number of paths returned by {@link Bm25SearchProvider.getPathsToRoot}. */
const MAX_PATHS = 5;

/** Thrown when a `search` query exceeds {@link MAX_QUERY_LENGTH}. */
export class SearchQueryTooLargeError extends Error {
  constructor(
    public readonly maxLength: number,
    public readonly actualLength: number,
  ) {
    super(
      `Search query exceeds maximum length of ${maxLength} characters (got ${actualLength}).`,
    );
    this.name = 'SearchQueryTooLargeError';
  }
}

/** Thrown when a cursor is malformed or out of range. */
export class InvalidSearchCursorError extends Error {
  constructor(public readonly cursor: string) {
    super(`Invalid search cursor: ${JSON.stringify(cursor)}`);
    this.name = 'InvalidSearchCursorError';
  }
}

export interface Bm25SearchProviderOptions extends SchemaIndexerOptions {
  // Reserved for future tuning (k1, b, etc.). Today: only excludeDeprecated.
}

interface SearchData {
  readonly index: Bm25Index;
  readonly reverseMap: ReadonlyMap<string, readonly SchemaCoordinate[]>;
  readonly rootTypeNames: ReadonlySet<string>;
}

/**
 * Default {@link SchemaSearchProvider} — BM25 over the schema's indexed
 * documents, with BFS path-to-root via the reverse adjacency map.
 *
 * Direct port of HotChocolate's `BM25SearchProvider`. Behavior matches the
 * .NET reference, including normalization (scores rescaled into `[0, 1]`
 * by dividing through the top-ranked result's raw score) and cursor
 * encoding (little-endian int32 base64).
 */
export class Bm25SearchProvider implements SchemaSearchProvider {
  private searchData?: SearchData;

  constructor(
    private readonly schema: GraphQLSchema,
    private readonly options: Bm25SearchProviderOptions = {},
  ) {}

  async search(
    query: string,
    first: number,
    after: string | null,
    minScore: number | null,
  ): Promise<readonly SchemaSearchResult[]> {
    if (typeof query !== 'string') {
      throw new TypeError('query must be a string');
    }
    if (!Number.isInteger(first) || first <= 0) {
      throw new RangeError('first must be a positive integer');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new SearchQueryTooLargeError(MAX_QUERY_LENGTH, query.length);
    }
    if (after !== null && after.length === 0) {
      throw new InvalidSearchCursorError(after);
    }

    const data = this.ensureIndex();
    const queryTokens = tokenize(query);
    const rawResults = data.index.search(queryTokens);

    if (rawResults.length === 0) {
      return [];
    }

    const maxRawScore = rawResults[0]!.score;
    const offset = after !== null ? decodeCursor(after, rawResults.length) : 0;

    const results: SchemaSearchResult[] = [];
    for (let i = offset; i < rawResults.length && results.length < first; i++) {
      const scored = rawResults[i]!;
      const normalized = maxRawScore > 0 ? scored.score / maxRawScore : 0;

      if (minScore !== null && normalized < minScore) {
        // rawResults are sorted by score desc; everything after this will
        // also fail the threshold.
        break;
      }

      results.push({
        coordinate: data.index.getCoordinate(scored.documentId),
        score: normalized,
        cursor: encodeCursor(i + 1),
      });
    }

    return results;
  }

  async getPathsToRoot(
    coordinate: SchemaCoordinate,
  ): Promise<readonly SchemaCoordinatePath[]> {
    const data = this.ensureIndex();
    const paths = findPathsToRoot(data, coordinate, MAX_PATHS);
    // Sort by path length, shortest first.
    paths.sort((a, b) => a.length - b.length);
    return paths;
  }

  private ensureIndex(): SearchData {
    if (this.searchData) {
      return this.searchData;
    }

    const queryType = this.schema.getQueryType();
    if (!queryType) {
      throw new Error(
        '[@graphql-hive/semantic-introspection] Bm25SearchProvider: schema must define a query type',
      );
    }

    const { documents, reverseMap } = indexSchema(this.schema, this.options);
    const index = Bm25Index.build(documents);

    const rootTypeNames = new Set<string>([queryType.name]);
    const mutation = this.schema.getMutationType();
    if (mutation) {
      rootTypeNames.add(mutation.name);
    }
    const subscription = this.schema.getSubscriptionType();
    if (subscription) {
      rootTypeNames.add(subscription.name);
    }

    this.searchData = { index, reverseMap, rootTypeNames };
    return this.searchData;
  }
}

function findPathsToRoot(
  data: SearchData,
  coordinate: SchemaCoordinate,
  maxPaths: number,
): SchemaCoordinate[][] {
  const { rootTypeNames, reverseMap } = data;
  const startTypeName = getCoordinateTypeName(coordinate);
  const isFieldCoord = coordinate.includes('.');
  const paths: SchemaCoordinate[][] = [];

  // If the start type IS a root, the path is just the coordinate itself
  // (for field coordinates) or empty (for type coordinates).
  if (rootTypeNames.has(startTypeName)) {
    if (isFieldCoord) {
      paths.push([coordinate]);
    }
    return paths;
  }

  // BFS over the reverse adjacency. Uses a head cursor rather than
  // `queue.shift()` (which is O(n) per dequeue → O(V²) overall) so the
  // traversal is true O(V + E).
  const queue: { typeName: string; path: SchemaCoordinate[] }[] = [
    { typeName: startTypeName, path: [] },
  ];
  let head = 0;
  const visited = new Set<string>([startTypeName]);

  while (head < queue.length && paths.length < maxPaths) {
    const { typeName: currentType, path: currentPath } = queue[head++]!;
    const references = reverseMap.get(currentType);
    if (!references) {
      continue;
    }

    for (const reference of references) {
      const referenceTypeName = getCoordinateTypeName(reference);
      if (visited.has(referenceTypeName)) {
        continue;
      }
      visited.add(referenceTypeName);

      const newPath: SchemaCoordinate[] = [reference, ...currentPath];

      if (rootTypeNames.has(referenceTypeName)) {
        if (isFieldCoord) {
          newPath.push(coordinate);
        }
        paths.push(newPath);
        if (paths.length >= maxPaths) {
          break;
        }
      } else {
        queue.push({ typeName: referenceTypeName, path: newPath });
      }
    }
  }

  return paths;
}

function getCoordinateTypeName(coordinate: SchemaCoordinate): string {
  const dot = coordinate.indexOf('.');
  return dot >= 0 ? coordinate.slice(0, dot) : coordinate;
}

/** Little-endian int32 base64, matching .NET BitConverter.GetBytes output. */
function encodeCursor(offset: number): string {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(offset, 0);
  return buf.toString('base64');
}

function decodeCursor(cursor: string, resultCount: number): number {
  // `Buffer.from(s, 'base64')` is lenient — it silently drops invalid
  // characters and never throws — so a try/catch here would be dead code.
  // Validate canonically instead: decode, require exactly 4 bytes, and
  // re-encode to confirm the input was the canonical base64 of those bytes
  // (this rejects garbage/non-canonical cursors that would otherwise decode
  // to an arbitrary offset).
  const bytes = Buffer.from(cursor, 'base64');
  if (bytes.length !== 4 || bytes.toString('base64') !== cursor) {
    throw new InvalidSearchCursorError(cursor);
  }
  const offset = bytes.readInt32LE(0);
  if (offset < 0 || offset > resultCount) {
    throw new InvalidSearchCursorError(cursor);
  }
  return offset;
}
