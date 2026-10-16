/**
 * Somnium Engine — counterfactual depth and structural divergence.
 *
 * docs/ARCHITECTURE-RECONNAISSANCE.md §8. Depth is a PAIR of orthogonal
 * measures, never a scalar intervention count:
 *
 *   1. genealogicalDepth — length of the parent chain from the baseline
 *      universe. Pure bookkeeping.
 *   2. divergence — a STRUCTURAL measure of how far the world actually moved,
 *      computed over the WorldDiff plus a graph-distance BFS over the
 *      post-intervention REQUIRES ∪ ENABLES graph. Five no-op interventions
 *      score 0; one world-altering intervention scores high.
 *
 * Everything here is a pure deterministic function of the inputs: sets and maps
 * are iterated in sorted-id order so results are byte-identical across calls.
 */
import type { Canon, CausalEdge } from "../canon/types";
import type { WorldState } from "../derive/world-state";
import { cellKey } from "../derive/propagation";
import { sameCanonicalValue } from "../canon/hash";
import { worldDiff } from "../diff/diff";
import type { Intervention } from "../timeline/types";
import type { DepthMetrics, DivergenceScore } from "./types";

/**
 * Post-intervention edge set: severEdge / addEdge applied in intervention
 * order over canon.edges. Mirrors buildModel in src/derive/propagation.ts
 * (which owns the derive-side resolution; its helpers are private, so this is
 * a small local copy). Sorted by edge id for determinism.
 */
function resolveEdges(canon: Canon, interventions: Intervention[]): CausalEdge[] {
  let edges: CausalEdge[] = canon.edges.map((e) => ({ ...e }));
  for (const iv of interventions) {
    if (iv.kind === "severEdge") {
      edges = edges.filter((e) => e.id !== iv.target);
    } else if (iv.kind === "addEdge") {
      const raw = iv.params?.edge;
      if (raw !== null && typeof raw === "object") {
        const edge = raw as CausalEdge;
        if (
          typeof edge.id === "string" &&
          typeof edge.kind === "string" &&
          typeof edge.from === "string" &&
          typeof edge.to === "string"
        ) {
          edges = edges.filter((e) => e.id !== edge.id);
          edges.push(edge);
        }
      }
    }
  }
  edges.sort((a, b) => a.id.localeCompare(b.id));
  return edges;
}

/**
 * Maximum shortest-path distance, over the post-intervention REQUIRES ∪ ENABLES
 * graph (directed prerequisite -> dependent, i.e. edge from -> to), from ANY
 * intervention target to ANY changed-status node. This is a STRUCTURAL DISTANCE
 * over the support graph — pure graph connectivity.
 *
 * It is NOT:
 *   - logical reachability — it never asks whether a derivation exists for the
 *     reached node, only whether an edge path exists;
 *   - executability — a graph-connected node can be UNKNOWN, UNSUPPORTED or
 *     CONTRADICTORY (i.e. never actually happens in this world); the metric
 *     says nothing about whether the node occurs;
 *   - causal influence — ENABLES edges are counted on equal footing with
 *     REQUIRES, but an enabler never grounds anything.
 *
 * Multi-source BFS seeded from every intervention target that is a node in the
 * graph (sorted for determinism); an intervention target that is itself changed
 * is at distance 0. The maximum is taken over finite distances to changed-status
 * nodes only — unreachable changed nodes are ignored. 0 when nothing changed.
 */
function graphDistance(
  canon: Canon,
  interventions: Intervention[],
  changedNodes: ReadonlySet<string>
): number {
  if (changedNodes.size === 0) return 0;

  // REQUIRES ∪ ENABLES adjacency, directed from (prerequisite) to (dependent).
  const adjacency = new Map<string, string[]>();
  const graphNodes = new Set<string>();
  for (const edge of resolveEdges(canon, interventions)) {
    if (edge.kind !== "REQUIRES" && edge.kind !== "ENABLES") continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
    graphNodes.add(edge.from);
    graphNodes.add(edge.to);
  }
  for (const key of adjacency.keys()) {
    adjacency.get(key)?.sort();
  }

  // BFS sources: intervention targets that are nodes in the graph. Per-kind the
  // target is an event id (negateEvent/forceEvent), an entity id
  // (setFact/relocate), a fact id (retractFact) or an edge id
  // (severEdge/addEdge — never a graph node). The graph-membership filter
  // implements "only ids that are nodes in the graph contribute".
  const sources = [...new Set(interventions.map((iv) => iv.target))]
    .filter((id) => graphNodes.has(id))
    .sort();

  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const source of sources) {
    dist.set(source, 0);
    queue.push(source);
  }
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) continue; // noUncheckedIndexedAccess: queue is dense, this never fires
    const d = dist.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      queue.push(next);
    }
  }

  let maxReach = 0;
  for (const node of changedNodes) {
    const d = dist.get(node);
    if (d !== undefined && d > maxReach) maxReach = d;
  }
  return maxReach;
}

/**
 * Structural divergence of `branch` against `baseline`: how far the world
 * actually moved, regardless of how many interventions were fired.
 *
 *   changedStatusCount — statusChanges in the WorldDiff
 *   changedStateCount  — effective facts compared by (subject, predicate),
 *                        counting a change when the object VALUE differs
 *                        between the two worlds (a key present on only one
 *                        side counts as a change). A distance-from-baseline
 *                        measure: an intervention that restores a canonical
 *                        value moves the world BACK toward baseline and
 *                        lowers this count.
 *   changedFactCount   — factAdditions + factRemovals + factOverrides
 *   impactedWorkCount  — canonical Works whose classification differs
 *                        (a work missing on one side differs only when the
 *                        other side is not UNKNOWN; the UNKNOWN default does
 *                        exactly that)
 *   graphDistance       — max shortest-path distance from any intervention
 *                        target to any changed-status node, over the
 *                        post-intervention REQUIRES ∪ ENABLES graph (structural
 *                        connectivity, deliberately independent of whether the
 *                        reached nodes actually execute)
 *   score              — changedStatusCount*1 + changedStateCount*1
 *                        + changedFactCount*0.5 + impactedWorkCount*2
 *                        + graphDistance*1
 */
export function computeDivergence(
  canon: Canon,
  baseline: WorldState,
  branch: WorldState,
  interventions: Intervention[]
): DivergenceScore {
  // Reuse the canonical diff lane — never reimplement diffing here.
  const diff = worldDiff(baseline, branch);

  const changedStatusCount = diff.statusChanges.length;
  const changedFactCount =
    diff.factAdditions.length + diff.factRemovals.length + diff.factOverrides.length;

  // Value-aware state changes: compare effective facts by (subject, predicate)
  // and count keys whose object VALUE differs, using a sentinel for absent.
  // A single subject+predicate with multiple effective facts collapses to one
  // entry per world — acceptable for v1.
  //
  // P-007 gate 3, same class as the semantic-dimension comparisons: the key uses
  // the shared `cellKey` (NUL-separated, injective) rather than a `|` join, and
  // the value comparison is `sameCanonicalValue` rather than `!==`. With `!==`,
  // `computeDivergence(W, W, [])` scored 1 on a world holding a NaN fact object —
  // a world diverging from itself. `DivergenceScore` is not a `semanticState`
  // dimension, so this was never an INV break, but it is the same defect and is
  // fixed in the same pass rather than left for a later round.
  const absent = Symbol("absent");
  const stateByKey = (ws: WorldState): Map<string, string | number | boolean | null | symbol> => {
    const m = new Map<string, string | number | boolean | null | symbol>();
    for (const f of ws.facts) m.set(cellKey(f.subject, f.predicate), f.object);
    return m;
  };
  const baseState = stateByKey(baseline);
  const branchState = stateByKey(branch);
  const stateKeys = [...new Set([...baseState.keys(), ...branchState.keys()])].sort();
  let changedStateCount = 0;
  for (const key of stateKeys) {
    const from = baseState.get(key) ?? absent;
    const to = branchState.get(key) ?? absent;
    if (!sameCanonicalValue(from, to)) changedStateCount += 1;
  }

  // Works whose classification differs between the two worlds, by key.
  const workKeys = [
    ...new Set([...Object.keys(baseline.workStatuses), ...Object.keys(branch.workStatuses)]),
  ].sort();
  let impactedWorkCount = 0;
  for (const workId of workKeys) {
    const from = baseline.workStatuses[workId] ?? "UNKNOWN";
    const to = branch.workStatuses[workId] ?? "UNKNOWN";
    if (from !== to) impactedWorkCount += 1;
  }

  const changedNodes = new Set(diff.statusChanges.map((s) => s.entityId));
  const reach = graphDistance(canon, interventions, changedNodes);

  const score =
    changedStatusCount * 1 +
    changedStateCount * 1 +
    changedFactCount * 0.5 +
    impactedWorkCount * 2 +
    reach * 1;

  return {
    changedStatusCount,
    changedStateCount,
    changedFactCount,
    impactedWorkCount,
    graphDistance: reach,
    score,
  };
}

/**
 * Full depth report for a branch: genealogical parent-chain length plus the
 * structural divergence of the branch against the baseline world.
 */
export function computeDepth(
  canon: Canon,
  baseline: WorldState,
  branch: WorldState,
  interventions: Intervention[],
  genealogicalDepth: number
): DepthMetrics {
  return {
    genealogicalDepth,
    interventionCount: interventions.length,
    divergence: computeDivergence(canon, baseline, branch, interventions),
  };
}
