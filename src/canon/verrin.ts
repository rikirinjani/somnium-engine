/**
 * Somnium Engine — the Verrin canon seed.
 *
 * Tiny invented canon (no copyright/canon ambiguity): a blight begins beneath
 * the city of Valdar, drives an exodus, and the engine's first counterfactual
 * branch asks "what if the Blight never began?".
 *
 * All ids below are part of the acceptance contract — see
 * tests/acceptance/poc-acceptance.test.ts. Every canon built here is
 * deterministic: `verrinCanon()` returns a fresh copy of the same content with
 * the same content hash on every call, so hashes computed against separate
 * constructions always match.
 *
 * Baseline-consistency of the dark edges:
 *   - EXCLUDES `ev/wardens-arrive EXCLUDES ev/valdar-besieged`: in baseline the
 *     Wardens arrive (REQUIRES ev/kael-oath, which REQUIRES ev/blight-begins),
 *     so the siege side is excluded. The siege is additionally un-supported:
 *     it REQUIRES ev/secret-betrayal, which (a) is prohibited by the INVARIANT
 *     edge and (b) dead-loops through fact/gate-bribed (a fact whose validFrom
 *     is the betrayal event itself, so it can never be effective). Exactly one
 *     side is therefore established — no join(ESTABLISHED, EXCLUDED) fires.
 *   - INVARIANT `ev/kael-oath INVARIANT ev/secret-betrayal`: an authorial rule
 *     ("Kael's oath of protection forbids the secret betrayal"). Source
 *     established in baseline, target never established -> holds vacuously
 *     without contradiction.
 */
import { computeRewindHash, hashCanon } from "./hash";
import { INSTANCE_OF } from "./types";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "./types";
import type { RewindPoint } from "../timeline/types";

const CANON_ID = "canon/verrin";
const ANCHOR = "ev/blight-begins";
const CREATED = "2026-08-30T00:00:00.000Z";

const entities: Entity[] = [
  // characters
  { id: "char/vara", kind: "Character", name: "Vara", description: "A young historian of the Valdar Academy; flees in the Exodus." },
  { id: "char/kael", kind: "Character", name: "Kael", description: "Vara's brother; a stonewright who swears an oath to defend Valdar." },
  { id: "char/maren", kind: "Character", name: "Maren", description: "An Ember Court envoy who returns to Valdar bearing the treaty." },
  { id: "char/orin", kind: "Character", name: "Orin", description: "Head of the Valdar Academy; defies the Ember Ultimatum." },
  { id: "char/selys", kind: "Character", name: "Selys", description: "Warden of the Stone Wardens, sworn to the old compact." },
  { id: "char/tomas", kind: "Character", name: "Tomas", description: "A junior scholar of the Valdar Academy and Vara's friend." },
  // locations
  { id: "loc/valdar", kind: "Location", name: "Valdar", description: "The city the story revolves around." },
  { id: "loc/thornhollow", kind: "Location", name: "Thornhollow", description: "The refuge beyond the Ashfall where the exiles gather." },
  { id: "loc/cinderwatch", kind: "Location", name: "Cinderwatch", description: "Seat of the Ember Court, far to the south." },
  { id: "loc/stonehall", kind: "Location", name: "Stonehall", description: "The mountain keep of the Stone Wardens." },
  // factions
  { id: "fac/ember-court", kind: "Faction", name: "Ember Court", description: "Southern fire-mages who deliver the ultimatum." },
  { id: "fac/stone-wardens", kind: "Faction", name: "Stone Wardens", description: "Guardians of the old roads; they answer Kael's oath." },
  // institution
  { id: "inst/valdar-academy", kind: "Institution", name: "Valdar Academy", description: "Valdar's oldest institution of record and learning." },
  // events (12 contract ids + 1 seed-internal dead-end event)
  { id: "ev/blight-begins", kind: "Event", name: "The Blight Begins", description: "A corruption blooms in the foundations of Valdar." },
  { id: "ev/exodus", kind: "Event", name: "The Exodus", description: "The citizens flee Valdar for Thornhollow." },
  { id: "ev/ashfall-falls", kind: "Event", name: "Ashfall Falls", description: "Cinders rain down across the broken valley." },
  { id: "ev/ember-ultimatum", kind: "Event", name: "The Ember Ultimatum", description: "The Ember Court demands Valdar's surrender." },
  { id: "ev/orin-defies", kind: "Event", name: "Orin Defies", description: "Orin refuses the ultimatum before the court." },
  { id: "ev/wardens-arrive", kind: "Event", name: "The Wardens Arrive", description: "The Stone Wardens march into Valdar." },
  { id: "ev/valdar-besieged", kind: "Event", name: "Valdar Besieged", description: "Valdar is besieged from within and without." },
  { id: "ev/treaty-of-ash", kind: "Event", name: "The Treaty of Ash", description: "Peace is signed in the ash." },
  { id: "ev/vara-vow", kind: "Event", name: "Vara's Vow", description: "Vara vows to return and rebuild Valdar." },
  { id: "ev/kael-oath", kind: "Event", name: "Kael's Oath", description: "Kael swears to guard the city through the dark." },
  { id: "ev/maren-return", kind: "Event", name: "Maren Returns", description: "Maren returns to Valdar as an envoy of the court." },
  { id: "ev/valdar-rebuilds", kind: "Event", name: "Valdar Rebuilds", description: "The long rebuilding of Valdar begins." },
  { id: "ev/secret-betrayal", kind: "Event", name: "The Secret Betrayal", description: "The city gates are opened from within — no path to it in baseline." },
  // event types (P-005): the KIND of a happening, distinct from an occurrence.
  // Verrin expresses recurrence as INDEPENDENT PARALLEL occurrences: two people
  // swear binding oaths in answer to the same catastrophe, and the two acts have
  // different consequences. (Ordos expresses recurrence differently — as
  // competing alternatives — which is the cross-canon genericity contrast.)
  { id: "type/oath-sworn", kind: "EventType", name: "An Oath Sworn", description: "A character binds themselves by a vow." },
  // works
  { id: "work/verrin-ashfall", kind: "Work", name: "Verrin: Ashfall", description: "The canonical first cycle: blight, exodus, ashfall." },
  { id: "work/ember-prelude", kind: "Work", name: "Verrin: Ember Prelude", description: "The ultimatum and Orin's defiance." },
  { id: "work/wardens-pact", kind: "Work", name: "Verrin: The Wardens' Pact", description: "The Wardens' arrival and the Treaty of Ash." },
];

const facts: Fact[] = [
  // CRITICAL (acceptance contract): Vara's location flips exactly at the Exodus.
  { id: "fact/vara-in-valdar", subject: "char/vara", predicate: "located_in", object: "loc/valdar", validFrom: null, validTo: "ev/exodus", source: "canon" },
  { id: "fact/vara-in-thornhollow", subject: "char/vara", predicate: "located_in", object: "loc/thornhollow", validFrom: "ev/exodus", validTo: null, source: "canon" },
  // relationships
  { id: "fact/kael-sibling-vara", subject: "char/kael", predicate: "sibling_of", object: "char/vara", validFrom: null, validTo: null, source: "canon" },
  // affiliations / offices
  { id: "fact/vara-academy-affiliation", subject: "char/vara", predicate: "affiliated_with", object: "inst/valdar-academy", validFrom: null, validTo: "ev/exodus", source: "canon" },
  { id: "fact/orin-head-of-academy", subject: "char/orin", predicate: "head_of", object: "inst/valdar-academy", validFrom: null, validTo: null, source: "canon" },
  { id: "fact/maren-ember-court", subject: "char/maren", predicate: "affiliated_with", object: "fac/ember-court", validFrom: null, validTo: null, source: "canon" },
  { id: "fact/selys-leads-wardens", subject: "char/selys", predicate: "leader_of", object: "fac/stone-wardens", validFrom: null, validTo: null, source: "canon" },
  { id: "fact/tomas-academy-scholar", subject: "char/tomas", predicate: "affiliated_with", object: "inst/valdar-academy", validFrom: null, validTo: null, source: "canon" },
  // locations of institutions and factions
  { id: "fact/academy-in-valdar", subject: "inst/valdar-academy", predicate: "located_in", object: "loc/valdar", validFrom: null, validTo: null, source: "canon" },
  { id: "fact/ember-court-in-cinderwatch", subject: "fac/ember-court", predicate: "seated_in", object: "loc/cinderwatch", validFrom: null, validTo: null, source: "canon" },
  { id: "fact/wardens-in-thornhollow", subject: "fac/stone-wardens", predicate: "based_in", object: "loc/thornhollow", validFrom: null, validTo: null, source: "canon" },
  // narrative state (vanish from the world when their validFrom event is cut)
  { id: "fact/ashfall-blankets-valdar", subject: "loc/valdar", predicate: "blanketed_by", object: "ash", validFrom: "ev/ashfall-falls", validTo: null, source: "canon" },
  // dead-end fact: only effective in worlds where the betrayal already happened
  { id: "fact/gate-bribed", subject: "loc/valdar", predicate: "gate_bribed_by", object: "fac/ember-court", validFrom: "ev/secret-betrayal", validTo: null, source: "canon" },
  // occurrence -> type membership (P-005). Ordinary facts: they take part in
  // validity windows, diffing and interventions like any other, and the causal
  // engine gives them no special treatment. Two INDEPENDENT PARALLEL occurrences
  // of one kind — both oaths answer the blight, neither requires the other, and
  // they have different downstream consequences (Kael's summons the Wardens,
  // Vara's does not).
  { id: "fact/vara-vow-is-oath", subject: "ev/vara-vow", predicate: INSTANCE_OF, object: "type/oath-sworn", validFrom: null, validTo: null, source: "canon" },
  { id: "fact/kael-oath-is-oath", subject: "ev/kael-oath", predicate: INSTANCE_OF, object: "type/oath-sworn", validFrom: null, validTo: null, source: "canon" },
];

const edges: CausalEdge[] = [
  // REQUIRES (the 8 acceptance-contract pairs, plus seed support)
  // CONVENTION (types.ts): REQUIRES edge from=source/prerequisite, to=target/dependent.
  // "ev/exodus REQUIRES ev/blight-begins" is written from: ev/blight-begins, to: ev/exodus.
  { id: "edge/exodus-requires-blight", kind: "REQUIRES", from: "ev/blight-begins", to: "ev/exodus", note: "The exodus is impossible without the blight." },
  { id: "edge/ashfall-requires-exodus", kind: "REQUIRES", from: "ev/exodus", to: "ev/ashfall-falls", note: "Ashfall follows only after the roads empty." },
  { id: "edge/ember-ultimatum-requires-blight", kind: "REQUIRES", from: "ev/blight-begins", to: "ev/ember-ultimatum", note: "The court only moves once Valdar is weakened." },
  { id: "edge/orin-defies-requires-ultimatum", kind: "REQUIRES", from: "ev/ember-ultimatum", to: "ev/orin-defies", note: "Defiance presupposes the ultimatum." },
  { id: "edge/vara-vow-requires-blight", kind: "REQUIRES", from: "ev/blight-begins", to: "ev/vara-vow", note: "The vow is born from the blight." },
  { id: "edge/wardens-require-kael-oath", kind: "REQUIRES", from: "ev/kael-oath", to: "ev/wardens-arrive", note: "Only an oath summons the Wardens." },
  { id: "edge/treaty-requires-wardens", kind: "REQUIRES", from: "ev/wardens-arrive", to: "ev/treaty-of-ash", note: "The treaty is signed under Warden protection." },
  { id: "edge/rebuilds-require-treaty", kind: "REQUIRES", from: "ev/treaty-of-ash", to: "ev/valdar-rebuilds", note: "Rebuilding begins only after peace." },
  { id: "edge/kael-oath-requires-blight", kind: "REQUIRES", from: "ev/blight-begins", to: "ev/kael-oath", note: "The oath is sworn in answer to the blight." },
  { id: "edge/maren-return-requires-wardens", kind: "REQUIRES", from: "ev/wardens-arrive", to: "ev/maren-return", note: "Maren returns in the Wardens' train." },
  { id: "edge/besieged-requires-betrayal", kind: "REQUIRES", from: "ev/secret-betrayal", to: "ev/valdar-besieged", note: "Valdar can only fall to a siege opened from within." },
  { id: "edge/betrayal-requires-bribe", kind: "REQUIRES", from: "fact/gate-bribed", to: "ev/secret-betrayal", note: "The betrayal needs the gates already bought — a dead-end loop." },
  // PRECEDES (temporal skeleton; blight is the temporal root)
  { id: "edge/blight-before-exodus", kind: "PRECEDES", from: "ev/blight-begins", to: "ev/exodus" },
  { id: "edge/exodus-before-ashfall", kind: "PRECEDES", from: "ev/exodus", to: "ev/ashfall-falls" },
  { id: "edge/ultimatum-before-defiance", kind: "PRECEDES", from: "ev/ember-ultimatum", to: "ev/orin-defies" },
  { id: "edge/blight-before-oath", kind: "PRECEDES", from: "ev/blight-begins", to: "ev/kael-oath" },
  { id: "edge/oath-before-wardens", kind: "PRECEDES", from: "ev/kael-oath", to: "ev/wardens-arrive" },
  { id: "edge/exodus-before-vow", kind: "PRECEDES", from: "ev/exodus", to: "ev/vara-vow" },
  { id: "edge/wardens-before-treaty", kind: "PRECEDES", from: "ev/wardens-arrive", to: "ev/treaty-of-ash" },
  { id: "edge/return-before-treaty", kind: "PRECEDES", from: "ev/maren-return", to: "ev/treaty-of-ash" },
  { id: "edge/treaty-before-rebuild", kind: "PRECEDES", from: "ev/treaty-of-ash", to: "ev/valdar-rebuilds" },
  // ENABLES (soft access; the hard REQUIRES paths stay authoritative)
  { id: "edge/return-enables-treaty", kind: "ENABLES", from: "ev/maren-return", to: "ev/treaty-of-ash", note: "Maren's return softens the path to the treaty." },
  { id: "edge/defiance-enables-vow", kind: "ENABLES", from: "ev/orin-defies", to: "ev/vara-vow", note: "Orin's defiance steels Vara's resolve." },
  // MOTIVATES (narrative pressure, no status change)
  { id: "edge/exodus-motivates-vow", kind: "MOTIVATES", from: "ev/exodus", to: "ev/vara-vow", note: "Fleeing her city is what turns Vara's grief into a vow." },
  { id: "edge/blight-motivates-oath", kind: "MOTIVATES", from: "ev/blight-begins", to: "ev/kael-oath", note: "The blight is what moves Kael to swear." },
  // EXCLUDES (exactly one baseline pair — Wardens or siege, never both)
  { id: "edge/wardens-exclude-siege", kind: "EXCLUDES", from: "ev/wardens-arrive", to: "ev/valdar-besieged", note: "Valdar is either guarded by the Wardens or besieged — never both." },
  // INVARIANT (directed authorial prohibition that holds in baseline)
  { id: "edge/oath-forbids-betrayal", kind: "INVARIANT", from: "ev/kael-oath", to: "ev/secret-betrayal", note: "Authorial rule: Kael's oath of protection forbids the secret betrayal." },
];

const workBindings: WorkBinding[] = [
  { workId: "work/verrin-ashfall", events: ["ev/blight-begins", "ev/exodus", "ev/ashfall-falls"] },
  { workId: "work/ember-prelude", events: ["ev/ember-ultimatum", "ev/orin-defies"] },
  { workId: "work/wardens-pact", events: ["ev/wardens-arrive", "ev/treaty-of-ash"] },
];

/**
 * The Verrin canon, freshly constructed with its content hash computed via
 * `hashCanon` at construction time. Deterministic across calls.
 */
export function verrinCanon(): Canon {
  const body = {
    canonId: CANON_ID,
    version: "1.0.0",
    entities: entities.map((e) => ({ ...e })),
    facts: facts.map((f) => ({ ...f })),
    edges: edges.map((e) => ({ ...e })),
    workBindings: workBindings.map((w) => ({ ...w, events: [...w.events] })),
  };
  return { ...body, hash: hashCanon(body) };
}

/**
 * The single canonical Rewind Point: anchored at the moment the Blight begins,
 * with an empty cut (nothing precedes the blight in the temporal skeleton).
 */
export function verrinRewindPoint(): RewindPoint {
  const canon = verrinCanon();
  return {
    id: "RP-VERRIN-001",
    canonId: CANON_ID,
    anchorEvent: ANCHOR,
    cut: [],
    derivedHash: computeRewindHash(CANON_ID, ANCHOR, [], canon.hash),
    label: "The Blight begins",
    tags: ["blight", "cataclysm"],
    created: CREATED,
  };
}
