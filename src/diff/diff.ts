/**
 * Somnium Engine — world diff (P-007: semantic).
 *
 * worldDiff(A, B) compares the CANONICAL SEMANTIC PROJECTION of two worlds
 * (src/derive/semantic.ts) — the same projection stateHash folds. That one
 * choice is the P-007 invariant:
 *
 *   > For two worlds from the SAME canon:
 *   > worldDiff(A, B) is empty  ⟺  stateHash(A) === stateHash(B)
 *
 * (32-bit hash collisions excepted; the diff compares content, so it never
 * hides a difference a hash collides on.)
 *
 * What that means in practice, per dimension:
 *   - statuses: the world-semantic projection of judgments (lineage marks
 *     like `forced` never appear);
 *   - facts: CONTENT with validity windows (no source/overridden lineage);
 *   - edges: the effective causal LAW (sever/add are world changes even
 *     when every verdict coincides — the P-006 residual case);
 *   - contradictions / constraint violations / temporal violations:
 *     CONTENT-SET semantics — a record is "introduced" iff its full content
 *     is absent from the other world. Same id + different content appears in
 *     BOTH introduced and resolved: honest set semantics, and exactly what
 *     makes id-colliding records (phantom objects, observed=2 vs 3) visible;
 *   - work statuses: a DELTA, not a branch snapshot (a snapshot made
 *     worldDiff(A, A) non-identity).
 *
 * Determinism: every array is sorted (by id, content as tie-break); no map
 * iteration order is observable. Typed views are projections over this same
 * WorldDiff (src/diff/projections.ts).
 */
import { hashState } from "../canon/hash";
import { reachable } from "../query/query";
import type { WorldState } from "../derive/world-state";
import { semanticState } from "../derive/semantic";
import type {
  CanonicalContradiction,
  CanonicalFact,
} from "../derive/semantic";
import type { ConstraintViolationRecord } from "../derive/constraints";
import type { TemporalViolation } from "../derive/propagation";
import type {
  ContradictionDelta,
  EdgeChange,
  FactDelta,
  FactOverride,
  ReachabilityChange,
  StatusChange,
  WorkStatusChange,
  WorldDiff,
} from "./types";

const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);

/** Canonical fact -> diff entry (identical content; windows included). */
function toFactDelta(f: CanonicalFact): FactDelta {
  return {
    id: f.id,
    subject: f.subject,
    predicate: f.predicate,
    object: f.object,
    validFrom: f.validFrom,
    validTo: f.validTo,
  };
}

/** Canonical contradiction -> diff entry (lineage `source` never enters). */
function toContradictionDelta(c: CanonicalContradiction): ContradictionDelta {
  return { id: c.id, a: c.a, b: c.b, detail: c.detail, detectedAt: c.detectedAt };
}

/**
 * Content-set difference: records in `from` whose FULL canonical content is
 * absent from `to`. Not an id-difference — two records may share an id and
 * differ in content, and that difference is semantic (D5).
 */
function contentSetDiff<T>(from: T[], to: T[], key: (record: T) => string): T[] {
  const toKeys = new Set(to.map(key));
  return from.filter((record) => !toKeys.has(key(record)));
}

/** Stable content key for hashing set membership of a record. */
const contradictionKey = (c: CanonicalContradiction): string =>
  hashState({ id: c.id, a: c.a, b: c.b, detail: c.detail, detectedAt: c.detectedAt });

const constraintKey = (v: ConstraintViolationRecord): string =>
  hashState({
    id: v.id,
    constraintId: v.constraintId,
    typeId: v.typeId,
    bound: v.bound,
    observed: v.observed,
    limit: v.limit,
    detail: v.detail,
  });

const temporalKey = (t: TemporalViolation): string =>
  hashState({ edgeIds: t.edgeIds, nodes: t.nodes, detail: t.detail });

export function worldDiff(baseline: WorldState, branch: WorldState): WorldDiff {
  const a = semanticState(baseline);
  const b = semanticState(branch);

  // statusChanges: union of status keys (sorted); emit when from !== to.
  const statusKeys = [...new Set([...Object.keys(a.statuses), ...Object.keys(b.statuses)])].sort();
  const statusChanges: StatusChange[] = [];
  for (const entityId of statusKeys) {
    const from = a.statuses[entityId] ?? "UNKNOWN";
    const to = b.statuses[entityId] ?? "UNKNOWN";
    if (from !== to) statusChanges.push({ entityId, from, to });
  }

  // factAdditions / factRemovals: canonical fact content present in only one
  // world, by id. Windows are CONTENT: a fact whose window changed is a
  // different fact-state, reported via factOverrides below.
  const baseFacts = new Map(a.facts.map((f) => [f.id, f]));
  const branchFacts = new Map(b.facts.map((f) => [f.id, f]));
  const factAdditions: FactDelta[] = [...branchFacts.values()]
    .filter((f) => !baseFacts.has(f.id))
    .map(toFactDelta)
    .sort(byId);
  const factRemovals: FactDelta[] = [...baseFacts.values()]
    .filter((f) => !branchFacts.has(f.id))
    .map(toFactDelta)
    .sort(byId);

  // factOverrides: same fact id in both worlds — one entry per differing
  // field (object, validFrom, validTo), so a window change is visible as
  // itself, not smuggled through "object".
  const factOverrides: FactOverride[] = [];
  for (const [factId, branchFact] of branchFacts) {
    const baseFact = baseFacts.get(factId);
    if (baseFact === undefined) continue;
    if (baseFact.object !== branchFact.object) {
      factOverrides.push({ factId, field: "object", from: baseFact.object, to: branchFact.object });
    }
    if (baseFact.validFrom !== branchFact.validFrom) {
      factOverrides.push({ factId, field: "validFrom", from: baseFact.validFrom, to: branchFact.validFrom });
    }
    if (baseFact.validTo !== branchFact.validTo) {
      factOverrides.push({ factId, field: "validTo", from: baseFact.validTo, to: branchFact.validTo });
    }
  }
  factOverrides.sort((x, y) => x.factId.localeCompare(y.factId) || x.field.localeCompare(y.field));

  // edgeChanges: the effective causal LAW, by id. Same id + different content
  // collapses to ONE entry (added=true, branch content) — a documented
  // limitation: an edge "change" is rare (addEdge replaces by id) and the
  // branch's law is the world being diffed TO.
  const baseEdges = new Map(a.edges.map((e) => [e.id, e]));
  const branchEdges = new Map(b.edges.map((e) => [e.id, e]));
  const edgeChanges: EdgeChange[] = [];
  for (const [edgeId, edge] of branchEdges) {
    const base = baseEdges.get(edgeId);
    if (base === undefined || base.kind !== edge.kind || base.from !== edge.from || base.to !== edge.to) {
      edgeChanges.push({ edgeId, added: true, kind: edge.kind, from: edge.from, to: edge.to });
    }
  }
  for (const [edgeId, edge] of baseEdges) {
    if (!branchEdges.has(edgeId)) {
      edgeChanges.push({ edgeId, added: false, kind: edge.kind, from: edge.from, to: edge.to });
    }
  }
  edgeChanges.sort((x, y) => x.edgeId.localeCompare(y.edgeId) || (x.added === y.added ? 0 : x.added ? 1 : -1));

  // contradictions / constraintViolations / temporalViolations: CONTENT-SET
  // semantics. Same id + different content => introduced AND resolved.
  const contradictionsIntroduced = contentSetDiff(b.contradictions, a.contradictions, contradictionKey)
    .map(toContradictionDelta)
    .sort(byId);
  const contradictionsResolved = contentSetDiff(a.contradictions, b.contradictions, contradictionKey)
    .map(toContradictionDelta)
    .sort(byId);

  const constraintViolationsIntroduced = contentSetDiff(
    b.constraintViolations,
    a.constraintViolations,
    constraintKey
  ).sort(byId);
  const constraintViolationsResolved = contentSetDiff(
    a.constraintViolations,
    b.constraintViolations,
    constraintKey
  ).sort(byId);

  const temporalViolationsIntroduced = contentSetDiff(
    b.temporalViolations,
    a.temporalViolations,
    temporalKey
  );
  const temporalViolationsResolved = contentSetDiff(
    a.temporalViolations,
    b.temporalViolations,
    temporalKey
  );

  // reachabilityChanges: reachable(ws, id) = status ∈ {ESTABLISHED, CONTINGENT}.
  const reachabilityChanges: ReachabilityChange[] = [];
  for (const eventId of statusKeys) {
    const from = reachable(baseline, eventId);
    const to = reachable(branch, eventId);
    if (from !== to) reachabilityChanges.push({ eventId, from, to });
  }

  // workStatusChanges: DELTA over the union of work keys (sorted).
  const workKeys = [...new Set([...Object.keys(a.workStatuses), ...Object.keys(b.workStatuses)])].sort();
  const workStatusChanges: WorkStatusChange[] = [];
  for (const workId of workKeys) {
    const from = a.workStatuses[workId] ?? "UNKNOWN";
    const to = b.workStatuses[workId] ?? "UNKNOWN";
    if (from !== to) workStatusChanges.push({ workId, from, to });
  }

  const diff: WorldDiff = {
    statusChanges,
    factAdditions,
    factRemovals,
    factOverrides,
    edgeChanges,
    contradictionsIntroduced,
    contradictionsResolved,
    constraintViolationsIntroduced,
    constraintViolationsResolved,
    temporalViolationsIntroduced,
    temporalViolationsResolved,
    reachabilityChanges,
    workStatusChanges,
    hash: "",
  };
  // Deterministic content hash over everything except the hash field itself.
  const { hash: _excluded, ...content } = diff;
  diff.hash = hashState(content);
  return diff;
}
