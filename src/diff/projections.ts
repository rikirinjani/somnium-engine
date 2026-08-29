/**
 * Somnium Engine — typed diff projections.
 *
 * Typed views (CharacterDiff, EventDiff, RelationshipDiff, LocationDiff,
 * FactionDiff, WorkDiff) are FILTERS over the one generic WorldDiff — not
 * separate differs. Entity kind is resolved from the canon by subject id;
 * "relationship" = facts whose subject and object are both characters.
 */
import { hashState } from "../canon/hash";
import type { Canon, EntityKind, Fact } from "../canon/types";
import type { FactOverride, StatusChange, TypedDiff, WorldDiff } from "./types";

export type ProjectionKind = "character" | "event" | "relationship" | "location" | "faction" | "work";

const ENTITY_KIND_FOR_PROJECTION: Record<ProjectionKind, EntityKind | undefined> = {
  character: "Character",
  event: "Event",
  relationship: undefined, // handled specially (two character endpoints)
  location: "Location",
  faction: "Faction",
  work: "Work",
};

function buildKindMap(canon: Canon): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of canon.entities) m.set(e.id, e.kind);
  for (const w of canon.workBindings) m.set(w.workId, "Work");
  return m;
}

function hashOf(d: WorldDiff): string {
  return hashState({
    statusChanges: d.statusChanges,
    factAdditions: d.factAdditions,
    factRemovals: d.factRemovals,
    factOverrides: d.factOverrides,
    edgeChanges: d.edgeChanges,
    contradictionsIntroduced: d.contradictionsIntroduced,
    contradictionsResolved: d.contradictionsResolved,
    reachabilityChanges: d.reachabilityChanges,
    workStatuses: d.workStatuses,
  });
}

export function projectDiff(d: WorldDiff, canon: Canon, kind: ProjectionKind): WorldDiff {
  const kinds = buildKindMap(canon);
  const kindOf = (id: string): string | undefined => kinds.get(id);
  const entityKind = ENTITY_KIND_FOR_PROJECTION[kind];
  const isRelationship = kind === "relationship";

  // Fact subjects; relationship = both endpoints are characters.
  const factMatches = (f: Fact): boolean =>
    isRelationship
      ? typeof f.object === "string" &&
        kindOf(f.subject) === "Character" &&
        kindOf(f.object) === "Character"
      : entityKind !== undefined && kindOf(f.subject) === entityKind;

  // statusChanges: entity ids resolve to the requested entity kind.
  // relationship is a fact construct, not an entity kind — no statuses.
  const statusMatches = (c: StatusChange): boolean =>
    !isRelationship && entityKind !== undefined && kindOf(c.entityId) === entityKind;

  // factOverrides reference facts by id; resolve their subject from canon facts
  // plus any derived facts added by this diff.
  const subjectById = new Map<string, string>();
  for (const f of canon.facts) subjectById.set(f.id, f.subject);
  for (const f of d.factAdditions) subjectById.set(f.id, f.subject);
  const overrideMatches = (o: FactOverride): boolean => {
    if (isRelationship) return false;
    if (entityKind === undefined) return false;
    const subject = subjectById.get(o.factId);
    return subject !== undefined && kindOf(subject) === entityKind;
  };

  const projected: WorldDiff = {
    statusChanges: d.statusChanges.filter(statusMatches),
    factAdditions: d.factAdditions.filter(factMatches),
    factRemovals: d.factRemovals.filter(factMatches),
    factOverrides: d.factOverrides.filter(overrideMatches),
    edgeChanges: d.edgeChanges,
    contradictionsIntroduced: d.contradictionsIntroduced,
    contradictionsResolved: d.contradictionsResolved,
    reachabilityChanges: d.reachabilityChanges,
    workStatuses: { ...d.workStatuses },
    hash: "",
  };
  projected.hash = hashOf(projected);
  return projected;
}

export function typedDiff(d: WorldDiff, canon: Canon): TypedDiff {
  return {
    character: projectDiff(d, canon, "character"),
    event: projectDiff(d, canon, "event"),
    relationship: projectDiff(d, canon, "relationship"),
    location: projectDiff(d, canon, "location"),
    faction: projectDiff(d, canon, "faction"),
    work: projectDiff(d, canon, "work"),
    canon: { ...d }, // full
  };
}
