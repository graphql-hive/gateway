import type { Subschema } from '@graphql-tools/delegate';
import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLResolveInfo,
  OperationDefinitionNode,
  SelectionSetNode,
} from 'graphql';

export type PathSegment = string | number;

/**
 * One hop inside a multi-type BatchFetch. The batched document uses a single
 * merge field (from MergedTypeConfig.fieldName) with inline fragments when
 * needed; `alias` is only a stable id for plan dumps / debugging (results are
 * sliced by key ranges).
 */
export interface StitchBatchAlias {
  /** Stable id for this hop (`_e0`, …) - not a response field alias. */
  alias: string;
  entityTypeName: string;
  /** Subgraph-local selection (foreign fields stripped at plan time). */
  selectionSet: SelectionSetNode;
  flattenPaths: PathSegment[][];
  /** Shared merge-arg variable name from argsFromKeys (e.g. `representations`). */
  representationsVariable?: string;
}

/** Operation-level stitch plan node tree. */
export type StitchPlanNode =
  | { kind: 'Sequence'; nodes: StitchPlanNode[] }
  | { kind: 'Parallel'; nodes: StitchPlanNode[] }
  | {
      kind: 'Fetch';
      /** Stable id for barrier-free dataflow execute. */
      id?: string;
      /**
       * When same-type multi-path Fetches were collapsed, all original ids
       * that this hop satisfies for downstream dependsOn.
       */
      completesIds?: string[];
      /** Fetch/BatchFetch ids that must complete first. */
      dependsOn?: string[];
      /** Target subschema for this hop. */
      subschema: Subschema;
      /** Root field hops write into `data[responseKey]`. */
      rootField?: FieldNode;
      /** Entity hops: type used for merge field / merge resolver. */
      entityTypeName?: string;
      /** Selections to request from the target subschema. */
      selectionSet: SelectionSetNode;
      /** Path from operation root to the list/object being flattened into. */
      flattenPath?: PathSegment[];
      /**
       * Hive-QP BatchFetch: same entity selection applied at multiple flatten
       * paths in one hop (one DataLoader / merge-field wave).
       */
      flattenPaths?: PathSegment[][];
      /**
       * Prebuilt subgraph operation (Hive-style). When set, execute skips
       * prepareGatewayDocument / Transformer and calls the executor directly.
       */
      document?: DocumentNode;
    }
  | {
      kind: 'BatchFetch';
      id?: string;
      /**
       * All Fetch ids collapsed into this batch - dataflow marks every id
       * complete when the single HTTP call returns.
       */
      completesIds?: string[];
      dependsOn?: string[];
      subschema: Subschema;
      /** Multi-type / multi-selection hops -> one subgraph HTTP call. */
      aliases: StitchBatchAlias[];
      /** Prebuilt single merge-field document for one HTTP round-trip. */
      document?: DocumentNode;
    }
  | {
      kind: 'Island';
      /** Stable id for barrier-free dataflow execute. */
      id?: string;
      completesIds?: string[];
      dependsOn?: string[];
      parentTypeName: string;
      fieldNode: FieldNode;
      /**
       * Nested Island: resolve the local field on every object at this path
       * (e.g. `Book.author` under `books`). Omit for root Islands.
       */
      flattenPath?: PathSegment[];
      /**
       * Same-selection Island applied at multiple flatten paths (list fan-out
       * siblings). When set, overrides `flattenPath`.
       */
      flattenPaths?: PathSegment[][];
      /** Federated follow-up after the local resolver returns a merge key. */
      continue?: StitchPlanNode;
    }
  | {
      /**
       * Hive-style runtime `@skip`/`@include` branch. `condition` is the
       * variable name; true -> ifClause, otherwise elseClause.
       */
      kind: 'Condition';
      condition: string;
      ifClause?: StitchPlanNode;
      elseClause?: StitchPlanNode;
    };

export interface StitchPlan {
  operation: OperationDefinitionNode;
  fragments: Record<string, FragmentDefinitionNode>;
  root: StitchPlanNode;
  /** When true, executor must fall back to schema execute. */
  incomplete: boolean;
  /** Reasons the plan is incomplete (hooks, unsupported nodes, etc.). */
  incompleteReasons: string[];
}

/**
 * Static options for `createBackboneExecutor` / plan-cache keying.
 * Per-request GraphQL context is NOT an option - it comes from
 * `ExecutionRequest.context` and is passed into `buildStitchPlan` per call.
 */
export interface BackboneExecutorOptions {
  /**
   * Progressive override label handler (gateway `progressiveOverride`).
   * Used for plan-cache keying when `overrideLabels` is also set.
   * Persisted on `schema.extensions` so a post-`mapSchema` re-attach needs
   * no options bag.
   */
  handleProgressiveOverride?: (
    label: string,
    context: any,
  ) => boolean | Promise<boolean>;
  /**
   * Known progressive-override labels from the supergraph. Combined with
   * `handleProgressiveOverride` + request context to cache plans per enabled set.
   * Falls back to `schema.extensions.overrideLabels` when omitted.
   */
  overrideLabels?: Iterable<string>;
}

/** `schema.extensions` key for last-attached {@link BackboneExecutorOptions}. */
export const BACKBONE_EXECUTOR_OPTIONS_EXTENSION = 'backboneExecutorOptions';

/** Per-call inputs for `buildStitchPlan` (static opts + request context). */
export interface BuildStitchPlanOptions extends BackboneExecutorOptions {
  /**
   * Request GraphQL context - progressive override / delegationPlanBuilder
   * during planning. From `ExecutionRequest.context`, never a constructor opt.
   */
  context?: any;
}

export interface BackboneExecutionContext {
  schema: import('graphql').GraphQLSchema;
  document: DocumentNode;
  operation: OperationDefinitionNode;
  fragments: Record<string, FragmentDefinitionNode>;
  variableValues: Record<string, any>;
  contextValue: any;
  rootValue: any;
  signal?: AbortSignal;
  data: Record<string, any>;
  errors: Error[];
  infoStub: Partial<GraphQLResolveInfo>;
}
