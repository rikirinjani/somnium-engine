/**
 * Somnium Engine — what makes a fact assertion legal (P-005/ncr-004).
 *
 * ONE RULE, THREE CALL SITES. `validateCanon` applies it to canon facts;
 * `buildModel` and `applyFactInterventions` apply it to fact-writing
 * interventions. The rule lives here so the three cannot drift apart.
 *
 * WHY THIS MODULE EXISTS. P-005's headline rule — only canon declares the
 * vocabulary of a world — was stated as a universal and refuted six times, each
 * time by a route the previous fix had not enumerated. The fifth L2 gate then
 * named the shape of the remaining error precisely: the guard had reached a
 * convergence point (one predicate, both call sites) but the *content* of that
 * predicate was still an enumeration wearing invariant clothing. It decided
 * "is this an id?" by testing for a slash, and "is this declarable?" with a set
 * that did not match the canon rule it claimed to mirror. Two more routes
 * followed:
 *
 *   - a slash-free object id (`setFact(ev/kael-oath, instance_of, "phantomtype")`)
 *     invented an `EventType` on the shipped Verrin canon, and
 *     `occurrenceCount("phantomtype")` returned 1;
 *   - a canon FACT id used as a subject
 *     (`setFact(fact/seal-held-vaela, instance_of, type/investiture)`) enrolled
 *     it as an occurrence and inflated Ordos's count from 1 to 2 — while
 *     `validateCanon` rejects the identical canon fact.
 *
 * The honest form of the claim is therefore DIFFERENTIAL rather than a list:
 *
 *   > An intervention may assert no more than canon may.
 *
 * That is decidable, and it is a property of one function rather than of an
 * open set of routes. `factAssertionError` is that function; the differential
 * property is asserted directly in `src/canon/fact-rules.test.ts`.
 */
import { INSTANCE_OF } from "./types";
import type { Canon } from "./types";

/**
 * The declared vocabulary a fact assertion may draw on.
 *
 * Three sets, because the rules differ by position: only ENTITIES may be
 * subjects, entities and facts may both be id-shaped objects, and `instance_of`
 * has a typed signature (Event -> EventType).
 */
export interface FactVocabulary {
  /** every declared entity id — the only legal fact subjects */
  entityIds: ReadonlySet<string>;
  /** every declared fact id — legal as an id-shaped object, never as a subject */
  factIds: ReadonlySet<string>;
  /** declared `Event` entities — the domain of `instance_of` */
  eventIds: ReadonlySet<string>;
  /** declared `EventType` entities — the range of `instance_of` */
  eventTypeIds: ReadonlySet<string>;
}

export function buildFactVocabulary(canon: Canon): FactVocabulary {
  const entityIds = new Set<string>();
  const eventIds = new Set<string>();
  const eventTypeIds = new Set<string>();
  for (const entity of canon.entities) {
    entityIds.add(entity.id);
    if (entity.kind === "Event") eventIds.add(entity.id);
    else if (entity.kind === "EventType") eventTypeIds.add(entity.id);
  }
  return {
    entityIds,
    factIds: new Set(canon.facts.map((f) => f.id)),
    eventIds,
    eventTypeIds,
  };
}

export type FactAssertionReason =
  /** the subject is not a declared entity (a fact id is NOT a legal subject) */
  | "subject-not-entity"
  /** an id-shaped object that resolves to nothing declared */
  | "object-unresolved-id"
  /** a non-finite number (NaN / ±Infinity) is not a narrative value */
  | "object-not-finite"
  /** `instance_of` from something that is not a declared Event */
  | "instance-of-subject-not-event"
  /** `instance_of` to something that is not a declared EventType */
  | "instance-of-object-not-event-type";

export interface FactAssertionError {
  reason: FactAssertionReason;
  /** the offending id — the subject or the object, per `reason` */
  offender: string;
  detail: string;
}

/** Does a string look like an id reference? The `prefix/slug` canon convention. */
function looksLikeId(value: string): boolean {
  return value.includes("/");
}

/**
 * Why this fact assertion is illegal, or `null` when it is legal.
 *
 * Applies to a canon fact and to a fact-writing intervention alike — that
 * identity is the invariant, not any individual rule below.
 *
 * The rules, in order:
 *
 *   1. SUBJECT must be a declared entity. Facts describe things; a fact is not a
 *      thing. (`validateCanon` has always required this of canon facts; the
 *      intervention path did not, which was route 7b.)
 *   2. `instance_of` has a TYPED SIGNATURE: Event -> EventType. The core names
 *      this predicate (see `INSTANCE_OF`) precisely so the occurrence layer can
 *      be canon-agnostic, so the core also owns its domain and range. This is
 *      what makes "an intervention cannot invent an `EventType`" true rather
 *      than aspirational: the range check does not care whether the id contains
 *      a slash (route 7a), and it stops a type instantiating itself (route 7c).
 *   3. Any OTHER id-shaped object must resolve to a declared entity or fact.
 *      Convention-based, and its limits are real: a literal string containing a
 *      slash ("ash/ember") is rejected as if it were a reference, and a
 *      slash-free typo is accepted as a literal. Both are accepted costs for an
 *      untyped predicate space — which is exactly why the predicates the core
 *      *does* name get a typed rule instead.
 */
export function factAssertionError(
  subject: string,
  predicate: string,
  object: string | number | boolean | null,
  vocabulary: FactVocabulary
): FactAssertionError | null {
  if (!vocabulary.entityIds.has(subject)) {
    return {
      reason: "subject-not-entity",
      offender: subject,
      detail: `subject "${subject}" is not a declared entity`,
    };
  }

  if (predicate === INSTANCE_OF) {
    if (!vocabulary.eventIds.has(subject)) {
      return {
        reason: "instance-of-subject-not-event",
        offender: subject,
        detail: `only an Event may be an instance of an EventType; "${subject}" is not a declared Event`,
      };
    }
    if (typeof object !== "string" || !vocabulary.eventTypeIds.has(object)) {
      return {
        reason: "instance-of-object-not-event-type",
        offender: String(object),
        detail: `"${String(object)}" is not a declared EventType`,
      };
    }
    return null;
  }

  // A non-finite number is not a narrative value (P-007 gate 1, blocker 2).
  //
  // `NaN`, `Infinity` and `-Infinity` are legal inputs to the `number` half of
  // the object type, and they broke world identity two ways at once:
  // `JSON.stringify` collapses all three to `null`, so `stateHash` could not
  // distinguish them from an actual `null`, while `NaN !== NaN` made the diff
  // report a difference the hash could not see. `canonicalJson` is now
  // injective over them, but the deeper answer is that they are not values a
  // canon could ever assert either — so the differential rule ("an intervention
  // may assert no more than canon may") refuses them here, at the one place all
  // three call sites share, and the refusal becomes a first-class record rather
  // than a silently mangled fact.
  if (typeof object === "number" && !Number.isFinite(object)) {
    return {
      reason: "object-not-finite",
      offender: String(object),
      detail: `object ${String(object)} is not a finite number; a narrative fact cannot hold a non-finite value`,
    };
  }

  if (typeof object === "string" && looksLikeId(object)) {
    if (!vocabulary.entityIds.has(object) && !vocabulary.factIds.has(object)) {
      return {
        reason: "object-unresolved-id",
        offender: object,
        detail: `object "${object}" looks like an id reference but is not a declared entity or fact`,
      };
    }
  }

  return null;
}
