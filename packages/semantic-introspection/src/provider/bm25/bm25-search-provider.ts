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

const MAX_QUERY_LENGTH = 1024;
const MAX_PATHS = 5;

interface SearchData {
  index: Bm25Index;
  reverseMap: Map<string, SchemaCoordinate[]>;
  rootTypeNames: Set<string>;
}

/** BM25 search over the schema's indexed documents, with BFS path-to-root via the reverse adjacency map. */
export class Bm25SearchProvider implements SchemaSearchProvider {
  private searchData?: SearchData;

  constructor(
    private readonly schema: GraphQLSchema,
    private readonly options: SchemaIndexerOptions = {},
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
      throw new RangeError(
        `Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${query.length}).`,
      );
    }
    if (after !== null && after.length === 0) {
      throw new Error(`Invalid search cursor: ${JSON.stringify(after)}`);
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
        break; // rawResults sorted by score desc — everything after also fails.
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
      throw new Error('Bm25SearchProvider: schema must define a query type');
    }

    const { documents, reverseMap } = indexSchema(this.schema, this.options);
    const index = new Bm25Index(documents);

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

  // BFS over the reverse adjacency, head-indexed for O(V + E) dequeue.
  // Cycle detection walks the in-flight path rather than carrying a
  // per-branch `visited` Set — paths are short in practice (≤ schema
  // depth) and the linear scan is cheaper than allocating + copying
  // a Set on every branch.
  const queue: { typeName: string; path: SchemaCoordinate[] }[] = [
    { typeName: startTypeName, path: [] },
  ];
  let head = 0;

  while (head < queue.length && paths.length < maxPaths) {
    const { typeName: currentType, path: currentPath } = queue[head++]!;
    const references = reverseMap.get(currentType);
    if (!references) {
      continue;
    }

    for (const reference of references) {
      const referenceTypeName = getCoordinateTypeName(reference);
      if (pathRevisits(referenceTypeName, currentPath, startTypeName)) {
        continue;
      }

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

/** True when `typeName` already appears as a source type on `path` (or is the BFS origin). */
function pathRevisits(
  typeName: string,
  path: readonly SchemaCoordinate[],
  startTypeName: string,
): boolean {
  if (typeName === startTypeName) {
    return true;
  }
  for (const ref of path) {
    if (getCoordinateTypeName(ref) === typeName) {
      return true;
    }
  }
  return false;
}

function getCoordinateTypeName(coordinate: SchemaCoordinate): string {
  const dot = coordinate.indexOf('.');
  return dot >= 0 ? coordinate.slice(0, dot) : coordinate;
}

/** Little-endian int32 base64. Web APIs only — runs on Node, Bun, Deno, Workers, and the browser. */
function encodeCursor(offset: number): string {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, offset, true);
  return btoa(String.fromCharCode(...bytes));
}

function decodeCursor(cursor: string, resultCount: number): number {
  let binary: string;
  try {
    binary = atob(cursor);
  } catch {
    // `atob` throws on malformed base64; everything else is checked below.
    throw new Error(`Invalid search cursor: ${JSON.stringify(cursor)}`);
  }
  if (binary.length !== 4) {
    throw new Error(`Invalid search cursor: ${JSON.stringify(cursor)}`);
  }
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const offset = new DataView(bytes.buffer).getInt32(0, true);
  if (offset < 0 || offset > resultCount) {
    throw new Error(`Invalid search cursor: ${JSON.stringify(cursor)}`);
  }
  // Reject non-canonical encodings — only the exact roundtrip is valid.
  if (encodeCursor(offset) !== cursor) {
    throw new Error(`Invalid search cursor: ${JSON.stringify(cursor)}`);
  }
  return offset;
}
