/**
 * Somnium Engine — core ontology types.
 *
 * A canon is modeled as a constraint system over entities, facts, causal edges
 * and works — not as prose. Everything here is data; the engine is deterministic.
 */

export type EntityKind =
  | "Character"
  | "Location"
  | "Faction"
  | "Institution"
  | "Event"
  | "Work";

export interface Entity {
  id: string; // stable id, e.g. "char/vara"
  kind: EntityKind;
  name: string;
  description?: string;
}

/**
 * A typed attribute with a narrative-time validity window.
 * Narrative time is a partial order over events: a fact becomes true when its
 * validFrom event occurs and false when its validTo event occurs. null validFrom
 * = true at the start of canon; null validTo = never expires.
 */
export interface Fact {
  id: string; // e.g. "fact/vara-located-valdar"
  subject: string; // entity id
  predicate: string; // e.g. "located_in", "affiliated_with", "sibling_of"
  object: string | number | boolean | null;
  validFrom: string | null; // event id
  validTo: string | null; // event id
  source: "canon" | "derived";
}

export type EdgeKind =
  | "REQUIRES" // hard necessity: target impossible without source
  | "ENABLES" // soft access: target degraded, not contradictory
  | "MOTIVATES" // psychological/narrative: changes state, not status
  | "PRECEDES" // temporal constraint: source before target
  | "EXCLUDES" // symmetric mutual exclusion
  | "INVARIANT"; // directed prohibition: source established => target excluded

export interface CausalEdge {
  id: string; // e.g. "edge/exodus-requires-blight"
  kind: EdgeKind;
  from: string; // entity id (event or fact)
  to: string; // entity id (event or fact)
  note?: string;
}

/** A canonical story: an ordered set of events plus its fact scope. */
export interface WorkBinding {
  workId: string; // e.g. "work/verrin-ashfall"
  events: string[]; // event ids in narrative order
}

/**
 * The immutable, versioned canon document. Content-hashed; never edited in
 * place — a change produces a new canon version.
 */
export interface Canon {
  canonId: string; // e.g. "canon/verrin"
  version: string;
  entities: Entity[];
  facts: Fact[];
  edges: CausalEdge[];
  workBindings: WorkBinding[];
  /** Content hash over sorted-key JSON of everything above (FNV-1a). */
  hash: string;
}
