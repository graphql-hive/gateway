import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFragmentsFromDocument } from '@graphql-tools/executor';
import { buildStitchPlan, collectExecutableHops } from '@graphql-tools/stitch';
import { Kind, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';
import { DESCRIPTIONS, QUERIES } from './fixtures/planning-large/queries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPERGRAPH_SDL = readFileSync(
  join(__dirname, 'fixtures/planning-large/supergraph.graphql'),
  'utf8',
);

/** Pre-fold hop floors (ff83774a) — fold must stay well below these. */
const PRE_FOLD_HTTP = {
  product_page: 331,
  search: 274,
  checkout: 173,
  order_history: 159,
} as const;

/**
 * Exact-deps-only ceilings (`344f8894`). Aggressive wave fold must beat these
 * on scenarios where exact-deps lagged the reference query planner (especially
 * `search`).
 */
const EXACT_DEPS_HTTP = {
  product_page: 66,
  search: 80,
  checkout: 71,
  order_history: 79,
} as const;

function countBackboneHttp(root: Parameters<typeof collectExecutableHops>[0]) {
  const hops: Parameters<typeof collectExecutableHops>[1] = [];
  collectExecutableHops(root, hops, {});
  return hops.filter((h) => h.kind === 'Fetch' || h.kind === 'BatchFetch')
    .length;
}

function countQueryPlannerFetches(plan: { node?: unknown }): number {
  let fetches = 0;
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.kind === 'Fetch' || n.kind === 'BatchFetch') fetches++;
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(plan.node);
  return fetches;
}

/** Allow small slack vs reference query-planner fetches (cardinality / fold shape noise). */
function queryPlannerBandCeiling(referenceFetches: number): number {
  return Math.ceil(referenceFetches * 1.15) + 2;
}

describe('planning-large fold gates vs query planner', () => {
  it('keeps all four queries in the reference fetch band and beats exact-deps on search', async () => {
    const { QueryPlanner } = await import('@graphql-hive/router-query-planner');
    const schema = getStitchedSchemaFromSupergraphSdl({
      supergraphSdl: SUPERGRAPH_SDL,
    });
    const qp = new QueryPlanner(SUPERGRAPH_SDL);

    const names = Object.keys(QUERIES) as Array<keyof typeof QUERIES>;
    expect(names.sort()).toEqual(
      ['checkout', 'order_history', 'product_page', 'search'].sort(),
    );

    const results: Record<
      string,
      { backbone: number; reference: number; ceiling: number }
    > = {};

    for (const name of names) {
      const document = parse(QUERIES[name].replaceAll('__ID__', '1'));
      const op = document.definitions.find(
        (d) => d.kind === Kind.OPERATION_DEFINITION,
      )!;
      const plan = buildStitchPlan(
        schema,
        op,
        getFragmentsFromDocument(document),
        {},
      );
      expect(
        plan.incomplete,
        `${name} incomplete: ${plan.incompleteReasons}`,
      ).toBe(false);
      const backbone = countBackboneHttp(plan.root);
      const opName = op.name?.value ?? null;
      const qpPlan = qp.plan(
        QUERIES[name].replaceAll('__ID__', '1'),
        opName,
        new Set(),
        0,
      );
      const reference = countQueryPlannerFetches(qpPlan);
      const ceiling = queryPlannerBandCeiling(reference);
      results[name] = { backbone, reference, ceiling };

      // vs pre-fold: fold must be active on every scenario (all drop ≥2×)
      expect(
        backbone,
        `${name} (${DESCRIPTIONS[name]}): expected fold << pre-fold ${PRE_FOLD_HTTP[name]}`,
      ).toBeLessThanOrEqual(Math.floor(PRE_FOLD_HTTP[name] / 2));

      // vs reference query-planner fetches
      expect(
        backbone,
        `${name}: backbone ${backbone} > query-planner band ceiling ${ceiling} (reference ${reference})`,
      ).toBeLessThanOrEqual(ceiling);
    }

    // search discriminates exact-deps (80) vs gated (~48–58) vs reference (54)
    expect(
      results.search!.backbone,
      `search must beat exact-deps-only ${EXACT_DEPS_HTTP.search}`,
    ).toBeLessThanOrEqual(EXACT_DEPS_HTTP.search - 10);
    // Inline-fragment path dependsOn (Produces) puts nested entity hops after
    // path producers — search should be ≤ reference query-planner fetches.
    expect(
      results.search!.backbone,
      `search should be ≤ reference ${results.search!.reference}`,
    ).toBeLessThanOrEqual(results.search!.reference);

    // product_page / checkout / order_history: aggressive should not regress
    // past exact-deps when already near the reference planner band
    for (const name of ['product_page', 'checkout', 'order_history'] as const) {
      expect(
        results[name]!.backbone,
        `${name} should be ≤ exact-deps ${EXACT_DEPS_HTTP[name]}`,
      ).toBeLessThanOrEqual(EXACT_DEPS_HTTP[name]);
    }
  }, 120_000);
});
