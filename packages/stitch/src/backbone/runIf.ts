import type { StitchPlanNode, StitchRunIfClause } from './types.js';

/** Stable key so coalescing does not merge hops with different gates. */
export function runIfKey(runIf: StitchRunIfClause[] | undefined): string {
  if (!runIf?.length) {
    return '';
  }
  return runIf
    .map((c) => `${c.variable}=${c.equals ? '1' : '0'}`)
    .sort()
    .join('&');
}

export function mergeRunIf(
  a: StitchRunIfClause[] | undefined,
  b: StitchRunIfClause[] | undefined,
): StitchRunIfClause[] | undefined {
  if (!a?.length && !b?.length) {
    return undefined;
  }
  const byVar = new Map<string, boolean>();
  for (const list of [a, b]) {
    for (const c of list ?? []) {
      const prev = byVar.get(c.variable);
      if (prev !== undefined && prev !== c.equals) {
        // Contradictory ($v true AND $v false) - never runs.
        byVar.set(c.variable, c.equals);
        // Keep both impossible clauses via equals mismatch later at evaluate.
      }
      byVar.set(c.variable, c.equals);
    }
  }
  return [...byVar.entries()].map(([variable, equals]) => ({
    variable,
    equals,
  }));
}

/** True when every clause matches `variableValues` (missing runIf => always). */
export function evaluateRunIf(
  runIf: StitchRunIfClause[] | undefined,
  variableValues: Record<string, any> | undefined,
): boolean {
  if (!runIf?.length) {
    return true;
  }
  const vars = variableValues ?? {};
  for (const c of runIf) {
    if ((vars[c.variable] === true) !== c.equals) {
      return false;
    }
  }
  return true;
}

/**
 * Stamp additional `runIf` clauses onto every executable hop under `node`.
 * BatchFetch aliases inherit the same clauses (per-alias gates for batching).
 */
export function stampRunIf(
  node: StitchPlanNode,
  extra: StitchRunIfClause[],
): StitchPlanNode {
  if (!extra.length) {
    return node;
  }
  if (node.kind === 'Fetch') {
    return { ...node, runIf: mergeRunIf(node.runIf, extra) };
  }
  if (node.kind === 'BatchFetch') {
    return {
      ...node,
      runIf: mergeRunIf(node.runIf, extra),
      aliases: node.aliases.map((a) => ({
        ...a,
        runIf: mergeRunIf(a.runIf, extra),
      })),
    };
  }
  if (node.kind === 'Island') {
    return {
      ...node,
      runIf: mergeRunIf(node.runIf, extra),
      continue: node.continue ? stampRunIf(node.continue, extra) : undefined,
    };
  }
  if (node.kind === 'Condition') {
    return {
      ...node,
      ifClause: node.ifClause ? stampRunIf(node.ifClause, extra) : undefined,
      elseClause: node.elseClause
        ? stampRunIf(node.elseClause, extra)
        : undefined,
    };
  }
  if (node.kind === 'Sequence' || node.kind === 'Parallel') {
    return {
      kind: node.kind,
      nodes: node.nodes.map((c) => stampRunIf(c, extra)),
    };
  }
  return node;
}

/**
 * Replace Condition trees with `runIf` on hops so both branches stay in the
 * hop set (schedule is variable-independent; off hops no-op at execute).
 */
export function flattenConditionsToRunIf(node: StitchPlanNode): StitchPlanNode {
  if (node.kind === 'Condition') {
    const parts: StitchPlanNode[] = [];
    if (node.ifClause) {
      parts.push(
        stampRunIf(flattenConditionsToRunIf(node.ifClause), [
          { variable: node.condition, equals: true },
        ]),
      );
    }
    if (node.elseClause) {
      parts.push(
        stampRunIf(flattenConditionsToRunIf(node.elseClause), [
          { variable: node.condition, equals: false },
        ]),
      );
    }
    if (!parts.length) {
      return { kind: 'Parallel', nodes: [] };
    }
    if (parts.length === 1) {
      return parts[0]!;
    }
    return { kind: 'Parallel', nodes: parts };
  }
  if (node.kind === 'Island') {
    return {
      ...node,
      continue: node.continue
        ? flattenConditionsToRunIf(node.continue)
        : undefined,
    };
  }
  if (node.kind === 'Sequence' || node.kind === 'Parallel') {
    return {
      kind: node.kind,
      nodes: node.nodes.map(flattenConditionsToRunIf),
    };
  }
  return node;
}
