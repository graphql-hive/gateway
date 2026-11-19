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
 * Variable predicate for hop `runIf` (AND of clauses). Missing `runIf` means
 * the hop always runs. Mirrors Hive Router Fetch/BatchFetch `runIf` so
 * `@skip`/`@include` hops stay in one schedule and can BatchFetch together.
 */
export interface StitchRunIfClause {
  variable: string;
  /** Required boolean value of `variable` for the hop/alias to run. */
  equals: boolean;
}

/**
 * One hop inside a multi-type BatchFetch. The batched document uses a single
 * merge field (from MergedTypeConfig.fieldName) with inline fragments when
 * needed; `alias` is only a stable id for plan dumps / debugging (results are
 * sliced by key ranges).
 */
export interface StitchBatchAlias {
  /** Stable id for this hop (`_e0`, ...) - not a response field alias. */
  alias: string;
  entityTypeName: string;
  /** Subgraph-local selection (foreign fields stripped at plan time). */
  selectionSet: SelectionSetNode;
  flattenPaths: PathSegment[][];
  /** Shared merge-arg variable name from argsFromKeys (e.g. `reps`). */
  representationsVariable?: string;
  /** Per-alias `@skip`/`@include` gate; off aliases send no representations. */
  runIf?: StitchRunIfClause[];
}

/**
 * Operation-level stitch plan node tree.
 *
 * `Sequence` / `Parallel` are planner intermediate shape only. The final plan
 * returned from `buildStitchPlan` collapses them to a flat `Parallel` bag (or
 * a single hop); execute schedules solely from `dependsOn` / `completesIds`.
 */
export type StitchPlanNode =
  | { kind: 'Sequence'; nodes: StitchPlanNode[] }
  | { kind: 'Parallel'; nodes: StitchPlanNode[] }
  | {
      kind: 'Fetch';
      /** Stable id for dataflow execute. */
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
      /**
       * Paths from operation root to the list/object(s) being flattened into.
       * Multi-path when the same entity selection applies at several sites.
       */
      flattenPaths?: PathSegment[][];
      /**
       * Prebuilt subgraph operation. When set, execute skips
       * prepareGatewayDocument / Transformer and calls the executor directly.
       */
      document?: DocumentNode;
      /**
       * When set, hop runs only if every clause matches `variableValues`.
       * Used for root `@skip`/`@include` instead of Condition nodes.
       */
      runIf?: StitchRunIfClause[];
      /**
       * When `entityReuse` is on: hop ids whose results may already cover this
       * entity selection (execute may skip HTTP for matching parents).
       */
      reuseFrom?: string[];
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
      /** Hop-level gate (AND); also checked before any alias work. */
      runIf?: StitchRunIfClause[];
      reuseFrom?: string[];
    }
  | {
      kind: 'Island';
      /** Stable id for dataflow execute. */
      id?: string;
      completesIds?: string[];
      dependsOn?: string[];
      parentTypeName: string;
      fieldNode: FieldNode;
      /**
       * Nested Island: resolve the local field on every object at these paths
       * (e.g. `Book.author` under `books`). Omit for root Islands.
       */
      flattenPaths?: PathSegment[][];
      /** Federated follow-up after the local resolver returns a merge key. */
      continue?: StitchPlanNode;
      /** When set, Island runs only if every clause matches. */
      runIf?: StitchRunIfClause[];
    }
  | {
      /**
       * Runtime `@skip`/`@include` branch. `condition` is the variable name;
       * true -> ifClause, otherwise elseClause.
       * Prefer `runIf` on hops (flattened at plan time); Condition remains for
       * legacy / un-flattenable trees.
       */
      kind: 'Condition';
      condition: string;
      ifClause?: StitchPlanNode;
      elseClause?: StitchPlanNode;
    };

/**
 * Cached in-degree schedule for continuous dispatch. Hop indices match
 * {@link collectExecutableHops} order. Prefer `runIf` (var-independent hop set)
 * so the schedule can always be cached; omitted only when Condition remains.
 */
export interface StitchPlanSchedule {
  /** How many predecessor hops each hop waits for. */
  waits: number[];
  /** Hop indices that wait on each hop. */
  dependents: number[][];
}

export interface StitchPlan {
  operation: OperationDefinitionNode;
  fragments: Record<string, FragmentDefinitionNode>;
  root: StitchPlanNode;
  /**
   * Precomputed schedule for `root` when it has no Condition. Execute rebuilds
   * from the selected branch when Condition is present. With `runIf`-only plans
   * the hop set is fixed and schedule is always present.
   */
  schedule?: StitchPlanSchedule;
  /** When true, executor must fall back to schema execute. */
  incomplete: boolean;
  /** Reasons the plan is incomplete (hooks, unsupported nodes, etc.). */
  incompleteReasons: string[];
  /**
   * Opt-in entity reuse (Hive Router traffic_shaping.entity_reuse). When true,
   * execute may skip entity HTTP when parents already hold needed fields.
   */
  entityReuse?: boolean;
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
  /**
   * Opt-in: skip redundant entity HTTP when an earlier hop already projected
   * needed fields (Hive Router entity reuse). Off by default.
   */
  entityReuse?: boolean;
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
  /** Copied from plan / executor options for entity-reuse skips. */
  entityReuse?: boolean;
}
