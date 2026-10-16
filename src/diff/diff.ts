/**
 * Somnium Engine — world diff (P-007 convergence).
 *
 * TWO FUNCTIONS, TWO ROLES:
 *
 *   `semanticDelta(a, b)` — THE invariant-bearing comparison. Takes two
 *   EffectiveSemanticState representations and NOTHING ELSE (review ▲2): raw
 *   WorldState is untypeable as its input, so gate 4's raw-read bypass is
 *   inexpressible. For every dimension in the declaration table: keys only in
 *   B are added, keys only in A removed, keys in both with differing canonical
 *   content changed. This is a pure function of the two representations, so
 *
 *      semanticDelta(A, B) is empty  ⟺  representation(A) === representation(B)
 *
 *   holds BY CONSTRUCTION — one generic comparison, not thirteen.
 *
 *   `worldDiff(baseline, branch)` — a typed PRESENTATION projection over the
 *   delta (plus the representations, for rendering). Presentation may be lossy
 *   and may default absent keys to "UNKNOWN" for human readability; it may
 *   never decide what counts as a change. All thirteen fields render from the
 *   delta/representations; none computes anything by comparing raw worlds.
 *
 * Content-keyed dimensions (contradictions, constraintViolations,
 * temporalViolations) cannot produce "changed" entries by construction — their
 * key IS the canonical content, so a content difference is an added+removed
 * pair, which is exactly D5's introduced-AND-resolved semantics.
 *
 * Determinism: every array sorted by id (then field); `diff.hash` folds every
 * WorldDiff field except itself.
 */
import { canonicalJson, hashState, sameCanonicalValue } from "../canon/hash";
import type { WorldState } from "../derive/world-state";
import { effectiveSemanticState, DIMENSION_NAMES } from "../derive/semantic";
import type {
  CanonicalContradiction,
  CanonicalEdge,
  CanonicalFact,
  EffectiveSemanticState,
} from "../derive/semantic";
import type { ConstraintViolationRecord } from "../derive/constraints";
import type { TemporalViolation } from "../derive/propagation";
import type { EventStatus, WorkStatus } from "../derive/lattice";
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

/** One dimension's delta: the three buckets, keyed. */
export interface DimensionDelta {
  added: Map<string, unknown>;
  removed: Map<string, unknown>;
  changed: Map<string, { from: unknown; to: unknown }>;
}

/** Per-dimension deltas, keyed by dimension name. */
export type SemanticDelta = ReadonlyMap<string, DimensionDelta>;

/** THE comparison. Representations only (review ▲2). */
export function semanticDelta(a: EffectiveSemanticState, b: EffectiveSemanticState): SemanticDelta {
  const out = new Map<string, DimensionDelta>();
  for (const name of DIMENSION_NAMES) {
    const da = a[name] ?? {};
    const db = b[name] ?? {};
    const added = new Map<string, unknown>();
    const removed = new Map<string, unknown>();
    const changed = new Map<string, { from: unknown; to: unknown }>();
    for (const k of Object.keys(db)) {
      if (!(k in da)) added.set(k, db[k]);
      else if (canonicalJson(da[k]) !== canonicalJson(db[k])) changed.set(k, { from: da[k], to: db[k] });
    }
    for (const k of Object.keys(da)) {
      if (!(k in db)) removed.set(k, da[k]);
    }
    out.set(name, { added, removed, changed });
  }
  return out;
}

/** Empty ⟺ the two representations are equal (INV's left-hand side). */
export function semanticDeltaEmpty(delta: SemanticDelta): boolean {
  for (const d of delta.values()) {
    if (d.added.size > 0 || d.removed.size > 0 || d.changed.size > 0) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

function toFactDelta(f: CanonicalFact): FactDelta {
  return { id: f.id, subject: f.subject, predicate: f.predicate, object: f.object, validFrom: f.validFrom, validTo: f.validTo };
}

function toContradictionDelta(c: CanonicalContradiction): ContradictionDelta {
  return { id: c.id, a: c.a, b: c.b, detail: c.detail, detectedAt: c.detectedAt };
}

function toEdgeChange(e: CanonicalEdge, added: boolean): EdgeChange {
  return { edgeId: e.id, added, kind: e.kind, from: e.from, to: e.to, group: e.group };
}

/**
 * Per-field detail for a changed record, computed by walking the union of the
 * two records' OWN keys — no field list anywhere (gate 4 blocker 1,
 * inexpressible). `from`/`to` compare with `sameCanonicalValue`.
 */
function fieldOverrides(factId: string, from: unknown, to: unknown): FactOverride[] {
  const fa = from as Record<string, unknown>;
  const fb = to as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
  const out: FactOverride[] = [];
  for (const field of fields) {
    if (!sameCanonicalValue(fa[field], fb[field])) {
      out.push({ factId, field, from: fa[field], to: fb[field] });
    }
  }
  return out;
}

const byEntityId = (x: { entityId: string }, y: { entityId: string }): number => x.entityId.localeCompare(y.entityId);
const byIdField = (x: { id: string }, y: { id: string }): number => x.id.localeCompare(y.id);
const byWorkId = (x: { workId: string }, y: { workId: string }): number => x.workId.localeCompare(y.workId);

/** Presentation: a keyed-dimension delta over string-valued records → from/to entries. */
function renderStatusChanges(
  d: DimensionDelta,
  toChange: (id: string, from: EventStatus | undefined, to: EventStatus | undefined) => StatusChange
): StatusChange[] {
  const out: StatusChange[] = [];
  for (const [k, v] of d.added) out.push(toChange(k, undefined, v as EventStatus));
  for (const [k, v] of d.removed) out.push(toChange(k, v as EventStatus, undefined));
  for (const [k, { from, to }] of d.changed) {
    out.push(toChange(k, from as EventStatus, to as EventStatus));
  }
  return out.sort(byEntityId);
}

/* ------------------------------------------------------------------ */
/* worldDiff — presentation over the delta                             */
/* ------------------------------------------------------------------ */

export function worldDiff(baseline: WorldState, branch: WorldState): WorldDiff {
  const a = effectiveSemanticState(baseline);
  const b = effectiveSemanticState(branch);
  const delta = semanticDelta(a, b);

  // statuses / workStatuses: PRESENTATION defaults absent to "UNKNOWN" — the
  // comparison above used the maps; this only renders.
  const statusChanges = renderStatusChanges(
    delta.get("statuses") ?? { added: new Map(), removed: new Map(), changed: new Map() },
    (entityId, from, to) => ({ entityId, from: from ?? "UNKNOWN", to: to ?? "UNKNOWN" })
  );

  const facts = delta.get("facts") ?? { added: new Map(), removed: new Map(), changed: new Map() };
  const factAdditions: FactDelta[] = [...facts.added.values()].map((f) => toFactDelta(f as CanonicalFact)).sort(byIdField);
  const factRemovals: FactDelta[] = [...facts.removed.values()].map((f) => toFactDelta(f as CanonicalFact)).sort(byIdField);
  // A changed fact's fields are walked generically — subject, predicate, object,
  // windows, and any field added in the future.
  const factOverrides: FactOverride[] = [];
  for (const [k, { from, to }] of facts.changed) {
    factOverrides.push(...fieldOverrides(k, from, to));
  }
  factOverrides.sort((x, y) => x.factId.localeCompare(y.factId) || x.field.localeCompare(y.field));

  // edges: a REPLACEMENT (same id, different content) renders as BOTH sides —
  // removed-with-old-law and added-with-new-law — a presentation choice from
  // gate 1: both structures stay legible.
  const edges = delta.get("edges") ?? { added: new Map(), removed: new Map(), changed: new Map() };
  const edgeChanges: EdgeChange[] = [];
  for (const v of edges.added.values()) edgeChanges.push(toEdgeChange(v as CanonicalEdge, true));
  for (const v of edges.removed.values()) edgeChanges.push(toEdgeChange(v as CanonicalEdge, false));
  for (const { from, to } of edges.changed.values()) {
    edgeChanges.push(toEdgeChange(from as CanonicalEdge, false));
    edgeChanges.push(toEdgeChange(to as CanonicalEdge, true));
  }
  edgeChanges.sort((x, y) => x.edgeId.localeCompare(y.edgeId) || (x.added === y.added ? 0 : x.added ? 1 : -1));

  // Content-keyed dimensions: "changed" is inexpressible (key IS content), so
  // introduced = added, resolved = removed — D5 semantics exactly.
  const contradictions = delta.get("contradictions") ?? { added: new Map(), removed: new Map(), changed: new Map() };
  const contradictionsIntroduced = [...contradictions.added.values()]
    .map((c) => toContradictionDelta(c as CanonicalContradiction))
    .sort(byIdField);
  const contradictionsResolved = [...contradictions.removed.values()]
    .map((c) => toContradictionDelta(c as CanonicalContradiction))
    .sort(byIdField);

  const constraints = delta.get("constraintViolations") ?? { added: new Map(), removed: new Map(), changed: new Map() };
  const constraintViolationsIntroduced = [...constraints.added.values()] as ConstraintViolationRecord[];
  constraintViolationsIntroduced.sort(byIdField);
  const constraintViolationsResolved = [...constraints.removed.values()] as ConstraintViolationRecord[];
  constraintViolationsResolved.sort(byIdField);

  const temporal = delta.get("temporalViolations") ?? { added: new Map(), removed: new Map(), changed: new Map() };
  const temporalViolationsIntroduced = [...temporal.added.values()] as TemporalViolation[];
  temporalViolationsResolvedSort(temporalViolationsIntroduced);
  const temporalViolationsResolved = [...temporal.removed.values()] as TemporalViolation[];
  temporalViolationsResolvedSort(temporalViolationsResolved);

  // reachability: derived FROM THE REPRESENTATIONS' statuses dimensions (never
  // from the raw WorldStates — gate 4's bypass, closed by construction).
  const as = a["statuses"] ?? {};
  const bs = b["statuses"] ?? {};
  const reachabilityChanges: ReachabilityChange[] = [];
  for (const eventId of [...new Set([...Object.keys(as), ...Object.keys(bs)])].sort()) {
    const from = isReachable(as[eventId]);
    const to = isReachable(bs[eventId]);
    if (from !== to) reachabilityChanges.push({ eventId, from, to });
  }

  const workStatusChanges: WorkStatusChange[] = renderWorkStatusChanges(
    delta.get("workStatuses") ?? { added: new Map(), removed: new Map(), changed: new Map() }
  );

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
  const { hash: _excluded, ...content } = diff;
  diff.hash = hashState(content);
  return diff;
}

function isReachable(status: unknown): boolean {
  return status === "ESTABLISHED" || status === "CONTINGENT";
}

function temporalViolationsResolvedSort(list: TemporalViolation[]): void {
  list.sort((x, y) => x.nodes.join(",").localeCompare(y.nodes.join(",")));
}

function renderWorkStatusChanges(d: DimensionDelta): WorkStatusChange[] {
  const out: WorkStatusChange[] = [];
  for (const [k, v] of d.added) out.push({ workId: k, from: "UNKNOWN", to: v as WorkStatus });
  for (const [k, v] of d.removed) out.push({ workId: k, from: v as WorkStatus, to: "UNKNOWN" });
  for (const [k, { from, to }] of d.changed) {
    out.push({ workId: k, from: from as WorkStatus, to: to as WorkStatus });
  }
  return out.sort(byWorkId);
}
