/**
 * Somnium Engine — diff types.
 *
 * ONE generic typed diff over the derived world store, with typed projections
 * (CharacterDiff, EventDiff, RelationshipDiff, ...) computed by filtering the
 * same WorldDiff. This kills KE's dual-diff divergence problem by construction.
 */
import type { EventStatus, WorkStatus } from "../derive/lattice";
import type { Fact } from "../canon/types";

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

export interface EdgeChange {
  edgeId: string;
  added: boolean; // true = added in branch, false = removed in branch
}

export interface ReachabilityChange {
  eventId: string;
  from: boolean;
  to: boolean;
}

export interface WorldDiff {
  statusChanges: StatusChange[];
  factAdditions: Fact[];
  factRemovals: Fact[];
  factOverrides: FactOverride[];
  edgeChanges: EdgeChange[];
  contradictionsIntroduced: ContradictionRecord[];
  contradictionsResolved: ContradictionRecord[];
  reachabilityChanges: ReachabilityChange[];
  /** canonical Work -> classification in the branch. */
  workStatuses: Record<string, WorkStatus>;
  /** content hash of the diff (for BranchRecord.diffHash). */
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
