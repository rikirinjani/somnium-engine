/**
 * Somnium Engine — world diff.
 *
 * ONE generic typed diff over the derived world store: structural status
 * changes, effective-fact additions/removals/overrides, contradiction deltas
 * and reachability changes — not numeric deltas. Typed views are projections
 * over this same WorldDiff (src/diff/projections.ts).
 */
import { hashState } from "../canon/hash";
import type { Fact } from "../canon/types";
import { reachable } from "../query/query";
import type { FactView, WorldState } from "../derive/world-state";
import type {
  ContradictionRecord,
  FactOverride,
  ReachabilityChange,
  StatusChange,
  WorldDiff,
} from "./types";

const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);

/** WorldDiff carries Fact[]; WorldState facts are FactView[] (no validity window). */
function toFact(fv: FactView): Fact {
  return {
    id: fv.id,
    subject: fv.subject,
    predicate: fv.predicate,
    object: fv.object,
    validFrom: null,
    validTo: null,
    source: fv.source,
  };
}

export function worldDiff(baseline: WorldState, branch: WorldState): WorldDiff {
  // statusChanges: union of status keys (sorted); emit when from !== to.
  const statusKeys = [...new Set([...Object.keys(baseline.statuses), ...Object.keys(branch.statuses)])].sort();
  const statusChanges: StatusChange[] = [];
  for (const entityId of statusKeys) {
    const from = baseline.statuses[entityId] ?? "UNKNOWN";
    const to = branch.statuses[entityId] ?? "UNKNOWN";
    if (from !== to) statusChanges.push({ entityId, from, to });
  }

  // factAdditions / factRemovals: effective facts present in only one world, by id.
  const baseFacts = new Map(baseline.facts.map((f) => [f.id, f]));
  const branchFacts = new Map(branch.facts.map((f) => [f.id, f]));
  const factAdditions: Fact[] = [...branchFacts.values()]
    .filter((f) => !baseFacts.has(f.id))
    .map(toFact)
    .sort(byId);
  const factRemovals: Fact[] = [...baseFacts.values()]
    .filter((f) => !branchFacts.has(f.id))
    .map(toFact)
    .sort(byId);

  // factOverrides: same fact id in both worlds with a different object.
  const factOverrides: FactOverride[] = [];
  for (const [factId, branchFact] of branchFacts) {
    const baseFact = baseFacts.get(factId);
    if (baseFact !== undefined && baseFact.object !== branchFact.object) {
      factOverrides.push({ factId, field: "object", from: baseFact.object, to: branchFact.object });
    }
  }
  factOverrides.sort((a, b) => a.factId.localeCompare(b.factId));

  // edgeChanges: reserved in v1 — statuses carry the observable change.
  const edgeChanges: WorldDiff["edgeChanges"] = [];

  // contradictionsIntroduced / Resolved: by record id.
  const baseContradictions = new Map(baseline.contradictions.map((c) => [c.id, c]));
  const branchContradictions = new Map(branch.contradictions.map((c) => [c.id, c]));
  const contradictionsIntroduced: ContradictionRecord[] = [...branchContradictions.values()]
    .filter((c) => !baseContradictions.has(c.id))
    .sort(byId);
  const contradictionsResolved: ContradictionRecord[] = [...baseContradictions.values()]
    .filter((c) => !branchContradictions.has(c.id))
    .sort(byId);

  // reachabilityChanges: reachable(ws, id) = status ∈ {ESTABLISHED, CONTINGENT}.
  const reachabilityChanges: ReachabilityChange[] = [];
  for (const eventId of statusKeys) {
    const from = reachable(baseline, eventId);
    const to = reachable(branch, eventId);
    if (from !== to) reachabilityChanges.push({ eventId, from, to });
  }

  const workStatuses = { ...branch.workStatuses };

  const diff: WorldDiff = {
    statusChanges,
    factAdditions,
    factRemovals,
    factOverrides,
    edgeChanges,
    contradictionsIntroduced,
    contradictionsResolved,
    reachabilityChanges,
    workStatuses,
    hash: "",
  };
  // Deterministic content hash over everything except the hash field itself.
  diff.hash = hashState({
    statusChanges: diff.statusChanges,
    factAdditions: diff.factAdditions,
    factRemovals: diff.factRemovals,
    factOverrides: diff.factOverrides,
    edgeChanges: diff.edgeChanges,
    contradictionsIntroduced: diff.contradictionsIntroduced,
    contradictionsResolved: diff.contradictionsResolved,
    reachabilityChanges: diff.reachabilityChanges,
    workStatuses: diff.workStatuses,
  });
  return diff;
}
