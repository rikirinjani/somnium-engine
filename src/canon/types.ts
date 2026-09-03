/**
 * Somnium Engine — core ontology types.
 *
 * A canon is modeled as a constraint system over entities, facts, causal edges
 * and works — not as prose. Everything here is data; the engine is deterministic.
 */

/**
 * What kinds of thing a canon may declare.
 *
 * `Object` (P-004) covers artifacts, relics, documents, weapons, regalia — any
 * inanimate thing that can be possessed, transferred, destroyed, or gate an
 * event. It earned its place in the core by being ubiquitous across fictional
 * canons rather than by being needed once: an artifact of office is not an
 * Ordos peculiarity. Every site that reads `kind` was audited when it was added
 * (see docs/ARCHITECTURE-RECONNAISSANCE.md §18.2 item 9) — a new kind that
 * silently falls through a projection filter is worse than no new kind.
 *
 * `EventType` (P-005) is the KIND of a happening, as distinct from an `Event`,
 * which has always been a single OCCURRENCE of one. `ev/rite-of-binding-vaela`
 * and `ev/rite-of-binding-galen` are two occurrences; `type/rite-of-binding` is
 * what they are both instances of. A canon links them with an ordinary
 * `instance_of` fact — no new edge kind, and an EventType is NOT a causal node:
 * a type does not occur, so it can neither ground nor refute anything.
 *
 * Deliberately NOT here: any kind that only one canon would use, and any
 * bibliographic notion (source, chapter, section). Citation is not world
 * structure; a canon that wants it can carry it as ordinary facts. Canon-specific
 * flavour belongs in free-form fact predicates, which is the extension point.
 */
export type EntityKind =
  | "Character"
  | "Location"
  | "Faction"
  | "Institution"
  | "Object"
  | "Event"
  | "EventType"
  | "Work";

/**
 * The canonical predicate linking an occurrence to its type (P-005).
 *
 * Named in the core so that occurrence/type queries and the OccurrenceDiff
 * projection are canon-agnostic, while remaining an ORDINARY fact: it takes part
 * in validity windows, diffing and interventions exactly like any other, and the
 * causal engine gives it no special treatment.
 */
export const INSTANCE_OF = "instance_of";

/**
 * The namespace reserved for engine-minted fact ids (P-007 gate 3).
 *
 * `overrideFact` mints an id here when an intervention writes a
 * (subject, predicate) cell canon declared no fact for. The effective fact list
 * is id-keyed downstream — `worldDiff` builds a Map from it, and
 * `computeWorkStatuses` matches canon facts by id — so a canon-declared id in
 * this namespace can collide with a minted one, which made an unrelated Work
 * read ALTERED. `inspectCanon` therefore rejects canon ids with this prefix.
 */
export const DERIVED_ID_PREFIX = "derived:";

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
  /**
   * Support-set label for REQUIRES edges (P-003). REQUIRES edges sharing a
   * target AND a group are CONJUNCTS of one sufficient set; distinct groups are
   * ALTERNATIVE sufficient sets, evaluated disjunctively.
   *
   *   A --REQUIRES(g1)--> C        C is supported by (A AND B) OR (D)
   *   B --REQUIRES(g1)--> C
   *   D --REQUIRES(g2)--> C
   *
   * Omitted => the default group "0", so a canon that never sets `group` is
   * pure conjunction — the pre-P-003 behaviour, bit-for-bit (an absent key is
   * absent from the content hash).
   *
   * Ignored on non-REQUIRES edges.
   */
  group?: string;
  note?: string;
}

/**
 * A canonical story: the events it consists of, plus optionally the world state
 * it presupposes.
 *
 * `facts` (P-004) lets a Work depend on a STATE and not only on a SEQUENCE.
 * "The investiture happens" is an event list; "the investiture is *this* story
 * only if the Seal is in the right hands" is a state requirement. A story
 * requiring a configuration of the world is a general narrative-constraint
 * pattern, not a peculiarity of one canon, which is why it is in the core.
 *
 * Omitted => no state requirement, so a canon that never sets it behaves exactly
 * as pre-P-004 (an absent key is absent from the content hash).
 */
export interface WorkBinding {
  workId: string; // e.g. "work/verrin-ashfall"
  events: string[]; // event ids in narrative order
  /** fact ids that must be effective for this Work to hold as written */
  facts?: string[];
}

/**
 * P-006 — cardinality constraint over an EventType (the generic constraint
 * layer). Declared on the CANON, evaluated over the EFFECTIVE occurrence set of
 * each derived world.
 *
 * Semantics (see experiments/p006/predictions.md):
 *   - the constraint is over OCCURRENCES (via instance_of), not over writes;
 *   - a violated bound is reported as a ConstraintViolationRecord in the
 *     derived WorldState — it does NOT mutate the world to become valid, does
 *     NOT declare events impossible, and is NOT a contradiction (BOTH);
 *   - evaluated per-world: a later branch that removes an occurrence returns to
 *     validity; there is no accumulating historical counter;
 *   - global per EventType is the smallest scope both seed canons require.
 *
 * Omitted => no cardinality constraints, so a canon that never sets the field
 * behaves exactly as pre-P-006 (absent key is absent from the content hash).
 */
export interface CardinalityConstraint {
  id: string; // e.g. "constraint/rite-at-most-one"
  /** the EventType id being constrained */
  typeId: string;
  bound: "AT_MOST_ONE" | "AT_LEAST_ONE";
  /** narrative note, never hashed into semantics */
  note?: string;
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
  /**
   * Ids this canon deliberately REFERENCES WITHOUT DECLARING (P-004).
   *
   * SE's case-K guarantee is that absence of knowledge never becomes falsehood:
   * an event referenced as a fact's validity boundary or a REQUIRES source, but
   * never declared as an entity, stays UNKNOWN and keeps its dependents UNKNOWN.
   * That is how a canon says "the parentage was never settled".
   *
   * Structurally, a deliberate unknown and a typo are identical — both are a
   * reference to a non-existent id. So the canon must DECLARE its intent here.
   * Listing an id makes the under-specification intentional (a validation
   * notice); omitting it makes the dangling reference an error. This is what
   * lets the validator enforce integrity without outlawing incompleteness.
   *
   * Omitted => the canon claims to be complete, so every reference must resolve.
   */
  unspecified?: string[];
  /**
   * P-006 — generic cardinality constraints over EventTypes. Evaluated over the
   * effective occurrence set in every derived world.
   *
   * Omitted => a canon with no cardinality declarations behaves exactly as
   * pre-P-006 (absent key is absent from the content hash).
   */
  constraints?: CardinalityConstraint[];
  /** Content hash over sorted-key JSON of everything above (FNV-1a). */
  hash: string;
}
