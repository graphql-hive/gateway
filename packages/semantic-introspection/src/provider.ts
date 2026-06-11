/**
 * Provider abstraction for schema search and path-to-root traversal.
 *
 * Two methods so the ranker stays path-unaware: search results carry
 * just coordinate/score/cursor, and `pathsToRoot` is fetched via a
 * separate call (resolver-derived).
 */

/** A schema coordinate string, e.g. `Query.user`, `User`, `User.email`. */
export type SchemaCoordinate = string;

/** An ordered path of coordinates from a root type to a target coordinate. */
export type SchemaCoordinatePath = readonly SchemaCoordinate[];

export interface SchemaSearchResult {
  /** Coordinate of the matched schema element. */
  readonly coordinate: SchemaCoordinate;
  /** Relevance score in `[0, 1]`, or `null` if scoring is not supported. */
  readonly score: number | null;
  /** Opaque cursor for forward pagination. */
  readonly cursor: string;
}

export interface SchemaSearchProvider {
  /**
   * Search the schema for elements matching the query, ordered by relevance.
   *
   * @param query Natural-language query.
   * @param first Maximum number of results to return.
   * @param after Opaque cursor for forward pagination; `null` to start at the beginning.
   * @param minScore Minimum relevance score in `[0, 1]`; results below are excluded.
   */
  search(
    query: string,
    first: number,
    after: string | null,
    minScore: number | null,
  ): Promise<readonly SchemaSearchResult[]>;

  /**
   * Paths from the given coordinate back to a root type, ordered shortest-first.
   * The implementation determines how many paths to return.
   */
  getPathsToRoot(
    coordinate: SchemaCoordinate,
  ): Promise<readonly SchemaCoordinatePath[]>;
}
