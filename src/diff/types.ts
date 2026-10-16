/**
 * Somnium Engine — diff types (P-007: semantic WorldDiff).
 *
 * ONE generic typed diff over the derived world store, with typed projections
 * (CharacterDiff, EventDiff, RelationshipDiff, ...) computed by filtering the
 * same WorldDiff. This kills KE's dual-diff divergence problem by construction.
 *
 * P-007 — WHAT A DIFF MEANS. WorldDiff describes changes in the EFFECTIVE
 * FICTIONAL WORLD (the canonical semantic projection, src/derive/semantic.ts),
 * not changes in implementation records or intervention history. Two
 * consequences, both measured before this change (experiments/p007/probes.ts):
 *
 *   1. Record churn is not semantic change: an idempotent write, a force of an
 *      already-true event, a sever+re-add net zero — all produce an EMPTY diff
 *      and equal stateHash. Lineage difference is identityHash's question.
 *   2. Semantic change is never hidden: the effective edge set (the causal
 *      law), constraint violations, temporal violations, and work-status
 *      changes are all diffed. A world where the oath is caused by the blight
 *      and a world where it is uncaused are DIFFERENT worlds even when every
 *      verdict coincides.
 *
 * The invariant this shape serves (INV): for two worlds from the same canon,
 * worldDiff(A, B) is empty ⟺ stateHash(A) === stateHash(B). Both sides
 * consume the same semanticState projection.
 *
 * CONTENT-SET semantics: every record dimension (contradictions, constraint
 * violations, temporal violations) is compared by FULL canonical content, not
 * by id. Two records may share an id and differ in content (the same
 * fact-write-illegal id with different phantom objects; the same violation id
 * with observed=2 vs observed=3) — id-diffing would hide exactly the semantic
 * differences this diff exists to surface.
 */
import type { EventStatus, WorkStatus } from "../derive/lattice";
import type { TemporalViolation } from "../derive/propagation";
import type { ConstraintViolationRecord } from "../derive/constraints";

export interface ContradictionRecord {
  id: string;
  a: string; // entity id involved
  b: string; // entity id involved
  detail: string; // human-readable explanation
  source: string; // intervention id or "canon"
  detectedAt: string; // entity id where detected
}

export interface StatusChange {
  entityId: string;
  from: EventStatus;
  to: EventStatus;
}

export interface FactOverride {
  factId: string;
  field: string;
  from: unknown;
  to: unknown;
}

/** A fact's world-semantic content as a diff entry (validity windows included). */
export interface FactDelta {
  id: string;
  subject: string;
  predicate: string;
  object: string | number | boolean | null;
  validFrom: string | null;
  validTo: string | null;
}

/** A contradiction's world-semantic content as a diff entry (no lineage). */
export interface ContradictionDelta {
  id: string;
  a: string;
  b: string;
  detail: string;
  detectedAt: string;
}

export interface EdgeChange {
  edgeId: string;
  added: boolean; // true = added in branch, false = removed in branch
  kind: string;
  from: string;
  to: string;
  /**
   * The support-set label as the derivation reads it: `"0"` by default on
   * REQUIRES, `null` on every other kind (P-007 gate 1). This field is the one
   * that decides whether same-target REQUIRES edges are conjuncts or
   * alternatives, so an edge delta that omitted it could not express a change
   * of causal structure.
   */
  group: string | null;
}

export interface ReachabilityChange {
  eventId: string;
  from: boolean;
  to: boolean;
}

export interface WorkStatusChange {
  workId: string;
  from: WorkStatus;
  to: WorkStatus;
}

export interface WorldDiff {
  statusChanges: StatusChange[];
  factAdditions: FactDelta[];
  factRemovals: FactDelta[];
  /** same fact id in both worlds, any differing field — one entry per field */
  factOverrides: FactOverride[];
  /** the effective causal LAW changed (P-007: no longer reserved-empty) */
  edgeChanges: EdgeChange[];
  contradictionsIntroduced: ContradictionDelta[];
  contradictionsResolved: ContradictionDelta[];
  constraintViolationsIntroduced: ConstraintViolationRecord[];
  constraintViolationsResolved: ConstraintViolationRecord[];
  temporalViolationsIntroduced: TemporalViolation[];
  temporalViolationsResolved: TemporalViolation[];
  reachabilityChanges: ReachabilityChange[];
  /** work classification DELTA (P-007: was a branch snapshot) */
  workStatusChanges: WorkStatusChange[];
  /** deterministic content hash of the diff itself */
  hash: string;
}

/** Typed projections over WorldDiff — filters, not separate differs. */
export interface TypedDiff {
  character: WorldDiff; // facts whose subject is a Character
  event: WorldDiff;
  relationship: WorldDiff; // two-endpoint facts
  location: WorldDiff;
  faction: WorldDiff;
  work: WorldDiff;
  canon: WorldDiff; // full
}
