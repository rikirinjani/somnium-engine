/**
 * Somnium Engine — the Ordos canon seed (P-004 second canon).
 *
 * A succession dispute over an artifact of office — structurally the INVERSE of
 * Verrin. Verrin is a cascade from one root event with characters whose
 * location flips once. Ordos is a contest between two competing routes, driven
 * by a FACT (who holds the Seal) gating EVENTS, with exclusion between facts,
 * alternative sufficient causes as the central mechanism, a load-bearing
 * deliberate unknown, and a deliberately partial temporal order.
 *
 * Premise: the chartered Ordos Chapter has a Seal of office; exactly one Warden
 * may hold it at a time. The Old Warden dies; Vaela claims by acclamation
 * (clean), Galen claims by inheritance (parentage the canon never settles). A
 * rite of binding cannot proceed unless the Seal is actually in the claimant's
 * hands.
 *
 * Each of the ten P-004 properties is forced by that premise, not bolted on:
 *   1.  Object entities — obj/seal-of-office and obj/charter-document.
 *   2.  Possession as a windowed fact — fact/seal-held-* with validFrom/validTo
 *       anchored to the death and the investiture, so the holder changes.
 *   3.  EXCLUDES between two FACTS — fact/seal-held-vaela EXCLUDES
 *       fact/seal-held-galen: at most one claimant holds the Seal.
 *   4.  A fact-gated event — ev/rite-of-binding-vaela REQUIRES
 *       fact/seal-held-vaela: the WORKING case of a REQUIRES from a fact.
 *   5.  Alternative sufficient causes — ev/vaela-recognised is supported by
 *       group "acclaim" (ev/vaela-acclaimed) OR group "blood"
 *       (fact/vaela-heir-valid); either route alone leaves the outcome standing.
 *   6.  A load-bearing unknown — fact/heir-claim-valid is anchored to
 *       ev/heir-proof-sworn, an event referenced but NEVER declared as an
 *       entity, so Galen's whole chain stays UNKNOWN (never FALSE).
 *   7.  Partially ordered events — Vaela's chain and Galen's chain share no
 *       PRECEDES edges between them; the canon genuinely does not order them.
 *   8.  An institution with no location — inst/ordos-chapter has no
 *       located_in fact.
 *   9.  Atemporal facts — fact/seal-is-silver and fact/charter-grants-veto have
 *       null/null windows.
 *   10. A Work with a facts requirement — work/investiture-of-vaela holds only
 *       if fact/seal-held-vaela is effective.
 *
 * Baseline derivation (traced against propagation.ts semantics): the death is
 * the temporal root; Vaela's route grounds fully (ESTABLISHED through the rite),
 * Galen's route stays UNKNOWN because fact/heir-claim-valid's window can never
 * open; the single EXCLUDES edge is satisfied (exactly one holder); no PRECEDES
 * cycle among occurring events; zero contradictions.
 *
 * This canon is a stress fixture, not a story: every id is part of the
 * structural contract asserted in ordos.test.ts.
 */
import { computeRewindHash, hashCanon } from "./hash";
import { INSTANCE_OF } from "./types";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "./types";
import type { RewindPoint } from "../timeline/types";

/** Deep-frozen id table, grouped by canon section — tests use these, never literals. */
export const ORDOS_IDS = deepFreeze({
  canon: "canon/ordos",
  rewindPoint: {
    id: "RP-ORDOS-001",
    created: "2026-08-31T00:00:00.000Z",
  },
  characters: {
    anselm: "char/anselm",
    vaela: "char/vaela",
    galen: "char/galen",
    petronius: "char/petronius",
    myrra: "char/myrra",
  },
  objects: {
    seal: "obj/seal-of-office",
    charter: "obj/charter-document",
  },
  institution: {
    chapter: "inst/ordos-chapter",
  },
  faction: {
    council: "fac/ordos-council",
  },
  events: {
    oldWardenDies: "ev/old-warden-dies",
    vaelaAcclaimed: "ev/vaela-acclaimed",
    vaelaRecognised: "ev/vaela-recognised",
    galenClaimsInheritance: "ev/galen-claims-inheritance",
    galenRecognised: "ev/galen-recognised",
    vaelaInvested: "ev/vaela-invested",
    galenInvested: "ev/galen-invested",
    riteBindingVaela: "ev/rite-of-binding-vaela",
    riteBindingGalen: "ev/rite-of-binding-galen",
    successionSettled: "ev/succession-settled",
    sealSurvey: "ev/seal-survey",
    charterVetoInvoked: "ev/charter-veto-invoked",
  },
  /** referenced by fact/heir-claim-valid's window but deliberately NEVER an entity */
  undeclared: {
    heirProofSworn: "ev/heir-proof-sworn",
  },
  /**
   * Event types (P-005). Ordos expresses recurrence as COMPETING ALTERNATIVES:
   * two rites of one kind, only one of which can complete, feeding a single
   * outcome through disjunctive support. Verrin expresses it as INDEPENDENT
   * PARALLEL occurrences. Same core mechanism, two different narrative shapes —
   * which is the cross-canon genericity contrast.
   */
  types: {
    riteOfBinding: "type/rite-of-binding",
    investiture: "type/investiture",
  },
  facts: {
    sealHeldAnselm: "fact/seal-held-anselm",
    sealHeldPetronius: "fact/seal-held-petronius",
    sealHeldVaela: "fact/seal-held-vaela",
    sealHeldGalen: "fact/seal-held-galen",
    vaelaHeirValid: "fact/vaela-heir-valid",
    heirClaimValid: "fact/heir-claim-valid",
    sealIsSilver: "fact/seal-is-silver",
    charterGrantsVeto: "fact/charter-grants-veto",
    anselmWarden: "fact/anselm-warden",
    vaelaWarden: "fact/vaela-warden",
    galenWarden: "fact/galen-warden",
    petroniusSeneschal: "fact/petronius-seneschal",
    chapterChartered: "fact/chapter-chartered",
    myrraPresides: "fact/myrra-presides",
    // occurrence -> type membership (P-005)
    vaelaRiteIsRite: "fact/vaela-rite-is-rite",
    galenRiteIsRite: "fact/galen-rite-is-rite",
    vaelaInvestitureIsInvestiture: "fact/vaela-investiture-is-investiture",
    galenInvestitureIsInvestiture: "fact/galen-investiture-is-investiture",
  },
  works: {
    investitureOfVaela: "work/investiture-of-vaela",
    claimOfGalen: "work/claim-of-galen",
    settlementOfSuccession: "work/settlement-of-succession",
  },
  edges: {
    vaelaAcclaimedRequiresDeath: "edge/vaela-acclaimed-requires-death",
    vaelaRecognisedRequiresAcclaimed: "edge/vaela-recognised-requires-acclaimed",
    vaelaRecognisedRequiresBlood: "edge/vaela-recognised-requires-blood",
    galenClaimsRequiresHeirProof: "edge/galen-claims-requires-heir-proof",
    galenRecognisedRequiresClaims: "edge/galen-recognised-requires-claims",
    vaelaInvestedRequiresRecognised: "edge/vaela-invested-requires-recognised",
    galenInvestedRequiresRecognised: "edge/galen-invested-requires-recognised",
    riteVaelaRequiresSealHeld: "edge/rite-vaela-requires-seal-held",
    riteGalenRequiresSealHeld: "edge/rite-galen-requires-seal-held",
    successionRequiresRiteVaela: "edge/succession-requires-rite-vaela",
    successionRequiresRiteGalen: "edge/succession-requires-rite-galen",
    sealSurveyRequiresSilver: "edge/seal-survey-requires-silver",
    charterVetoRequiresCharter: "edge/charter-veto-requires-charter",
    charterVetoRequiresRecognition: "edge/charter-veto-requires-recognition",
    deathBeforeAcclaim: "edge/death-before-acclaim",
    deathBeforeClaims: "edge/death-before-claims",
    acclaimBeforeRecognition: "edge/acclaim-before-recognition",
    recognitionBeforeInvestiture: "edge/recognition-before-investiture",
    investitureBeforeRite: "edge/investiture-before-rite",
    riteBeforeSettlement: "edge/rite-before-settlement",
    claimsBeforeInheritanceInvestiture: "edge/claims-before-inheritance-investiture",
    inheritanceInvestitureBeforeRite: "edge/inheritance-investiture-before-rite",
    galenRiteBeforeSettlement: "edge/galen-rite-before-settlement",
    sealHolderExclusion: "edge/seal-holder-exclusion",
  },
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const ANCHOR = ORDOS_IDS.events.oldWardenDies;
const CUT = [ANCHOR];

/* -------------------------------------------------------------------------- */
/* entity/fact/edge builders — the canon reads as data, not prose             */
/* -------------------------------------------------------------------------- */

const char = (id: string, name: string, description: string): Entity => ({
  id,
  kind: "Character",
  name,
  description,
});
const artifact = (id: string, name: string, description: string): Entity => ({
  id,
  kind: "Object",
  name,
  description,
});
const inst = (id: string, name: string, description: string): Entity => ({
  id,
  kind: "Institution",
  name,
  description,
});
const fac = (id: string, name: string, description: string): Entity => ({
  id,
  kind: "Faction",
  name,
  description,
});
const ev = (id: string, name: string, description: string): Entity => ({
  id,
  kind: "Event",
  name,
  description,
});
const work = (id: string, name: string, description: string): Entity => ({
  id,
  kind: "Work",
  name,
  description,
});
/** P-005: the KIND of a happening. Not a causal node — a type does not occur. */
const evtype = (id: string, name: string, description: string): Entity => ({
  id,
  kind: "EventType",
  name,
  description,
});
const fact = (
  id: string,
  subject: string,
  predicate: string,
  object: string | number | boolean | null,
  validFrom: string | null,
  validTo: string | null
): Fact => ({ id, subject, predicate, object, validFrom, validTo, source: "canon" });
const requires = (id: string, from: string, to: string, group?: string): CausalEdge =>
  group === undefined
    ? { id, kind: "REQUIRES", from, to }
    : { id, kind: "REQUIRES", from, to, group };
const precedes = (id: string, from: string, to: string): CausalEdge => ({
  id,
  kind: "PRECEDES",
  from,
  to,
});
const excludes = (id: string, from: string, to: string): CausalEdge => ({
  id,
  kind: "EXCLUDES",
  from,
  to,
});

/* -------------------------------------------------------------------------- */
/* canon content                                                              */
/* -------------------------------------------------------------------------- */

const entities: Entity[] = [
  char(ORDOS_IDS.characters.anselm, "Anselm", "The Old Warden of the Ordos Chapter; his death opens the succession."),
  char(ORDOS_IDS.characters.vaela, "Vaela", "Claimant by acclamation; the Chapter's clean choice."),
  char(ORDOS_IDS.characters.galen, "Galen", "Claimant by inheritance; his parentage is disputed and the canon never settles it."),
  char(ORDOS_IDS.characters.petronius, "Petronius", "Seneschal of the Chapter; keeps the Seal in trust between wardens."),
  char(ORDOS_IDS.characters.myrra, "Myrra", "Elder of the Chapter; presides over the Council."),
  artifact(ORDOS_IDS.objects.seal, "The Seal of Office", "Silver seal of the Warden's office; possession is the crux of the succession."),
  artifact(ORDOS_IDS.objects.charter, "The Charter", "The founding charter of the Ordos Chapter; grants the Chapter a veto."),
  inst(ORDOS_IDS.institution.chapter, "The Ordos Chapter", "The chartered institution the Warden serves."),
  fac(ORDOS_IDS.faction.council, "The Ordos Council", "The ruling conclave of elders within the Chapter."),
  ev(ORDOS_IDS.events.oldWardenDies, "The Old Warden Dies", "Anselm dies; the Seal passes into the Chapter's keeping."),
  ev(ORDOS_IDS.events.vaelaAcclaimed, "Vaela Acclaimed", "The Chapter acclaims Vaela as the next Warden."),
  ev(ORDOS_IDS.events.vaelaRecognised, "Vaela Recognised", "Vaela's claim is recognised, by acclamation or by settled blood."),
  ev(ORDOS_IDS.events.galenClaimsInheritance, "Galen Claims by Inheritance", "Galen formally claims the Wardenship by inheritance."),
  ev(ORDOS_IDS.events.galenRecognised, "Galen Recognised as Heir", "Galen's claim never settles: the parentage is disputed."),
  ev(ORDOS_IDS.events.vaelaInvested, "Vaela Invested", "The Seal is passed into Vaela's hands."),
  ev(ORDOS_IDS.events.galenInvested, "Galen's Investiture", "The investiture that would place the Seal in Galen's hands."),
  ev(ORDOS_IDS.events.riteBindingVaela, "Rite of Binding (Vaela)", "The rite that binds Vaela to the office; it cannot proceed without the Seal in hand."),
  ev(ORDOS_IDS.events.riteBindingGalen, "Rite of Binding (Galen)", "The rite that would bind Galen; it cannot proceed without the Seal in hand."),
  ev(ORDOS_IDS.events.successionSettled, "The Succession Settled", "The Chapter's succession resolves."),
  ev(ORDOS_IDS.events.sealSurvey, "The Seal Surveyed", "The Chapter surveys the Seal and confirms its silver."),
  ev(ORDOS_IDS.events.charterVetoInvoked, "The Charter Veto Invoked", "The Chapter's latent veto over a claimant, under the charter."),
  work(ORDOS_IDS.works.investitureOfVaela, "The Investiture of Vaela", "Vaela acclaimed, recognised, invested, and bound."),
  work(ORDOS_IDS.works.claimOfGalen, "The Claim of Galen", "The inheritance claim that never settles."),
  work(ORDOS_IDS.works.settlementOfSuccession, "The Settlement of the Succession", "The binding rite and the settled succession."),
  // event types (P-005): two kinds of act that each happen twice in this canon
  evtype(ORDOS_IDS.types.riteOfBinding, "Rite of Binding", "The rite that binds a claimant to the Warden's office."),
  evtype(ORDOS_IDS.types.investiture, "Investiture", "The passing of the Seal into a claimant's hands."),
];

const facts: Fact[] = [
  // possession as a windowed fact: the holder changes across the death and the investiture
  fact(ORDOS_IDS.facts.sealHeldAnselm, ORDOS_IDS.objects.seal, "held_by", ORDOS_IDS.characters.anselm, null, ORDOS_IDS.events.oldWardenDies),
  fact(ORDOS_IDS.facts.sealHeldPetronius, ORDOS_IDS.objects.seal, "held_by", ORDOS_IDS.characters.petronius, ORDOS_IDS.events.oldWardenDies, ORDOS_IDS.events.vaelaInvested),
  fact(ORDOS_IDS.facts.sealHeldVaela, ORDOS_IDS.objects.seal, "held_by", ORDOS_IDS.characters.vaela, ORDOS_IDS.events.vaelaInvested, null),
  fact(ORDOS_IDS.facts.sealHeldGalen, ORDOS_IDS.objects.seal, "held_by", ORDOS_IDS.characters.galen, ORDOS_IDS.events.galenInvested, null),
  // parentage: Vaela's is settled (atemporal); Galen's is the load-bearing unknown
  fact(ORDOS_IDS.facts.vaelaHeirValid, ORDOS_IDS.characters.vaela, "rightful_heir_of", ORDOS_IDS.characters.anselm, null, null),
  fact(ORDOS_IDS.facts.heirClaimValid, ORDOS_IDS.characters.galen, "rightful_heir_of", ORDOS_IDS.characters.anselm, ORDOS_IDS.undeclared.heirProofSworn, null),
  // atemporal facts: the Seal is silver; the charter grants a veto
  fact(ORDOS_IDS.facts.sealIsSilver, ORDOS_IDS.objects.seal, "made_of", "silver", null, null),
  fact(ORDOS_IDS.facts.charterGrantsVeto, ORDOS_IDS.objects.charter, "grants_veto_to", ORDOS_IDS.institution.chapter, null, null),
  // office, windowed to the death and the investitures
  fact(ORDOS_IDS.facts.anselmWarden, ORDOS_IDS.characters.anselm, "warden_of", ORDOS_IDS.institution.chapter, null, ORDOS_IDS.events.oldWardenDies),
  fact(ORDOS_IDS.facts.vaelaWarden, ORDOS_IDS.characters.vaela, "warden_of", ORDOS_IDS.institution.chapter, ORDOS_IDS.events.vaelaInvested, null),
  fact(ORDOS_IDS.facts.galenWarden, ORDOS_IDS.characters.galen, "warden_of", ORDOS_IDS.institution.chapter, ORDOS_IDS.events.galenInvested, null),
  // roles and relations (atemporal)
  fact(ORDOS_IDS.facts.petroniusSeneschal, ORDOS_IDS.characters.petronius, "seneschal_of", ORDOS_IDS.institution.chapter, null, null),
  fact(ORDOS_IDS.facts.chapterChartered, ORDOS_IDS.institution.chapter, "chartered_by", ORDOS_IDS.objects.charter, null, null),
  fact(ORDOS_IDS.facts.myrraPresides, ORDOS_IDS.characters.myrra, "presides_over", ORDOS_IDS.faction.council, null, null),
  // occurrence -> type membership (P-005). Ordinary atemporal facts: an
  // occurrence's KIND does not change over narrative time, even though whether
  // the occurrence happens very much does. Ordos's recurrence shape is COMPETING
  // ALTERNATIVES — two rites of one kind, at most one of which can complete.
  fact(ORDOS_IDS.facts.vaelaRiteIsRite, ORDOS_IDS.events.riteBindingVaela, INSTANCE_OF, ORDOS_IDS.types.riteOfBinding, null, null),
  fact(ORDOS_IDS.facts.galenRiteIsRite, ORDOS_IDS.events.riteBindingGalen, INSTANCE_OF, ORDOS_IDS.types.riteOfBinding, null, null),
  fact(ORDOS_IDS.facts.vaelaInvestitureIsInvestiture, ORDOS_IDS.events.vaelaInvested, INSTANCE_OF, ORDOS_IDS.types.investiture, null, null),
  fact(ORDOS_IDS.facts.galenInvestitureIsInvestiture, ORDOS_IDS.events.galenInvested, INSTANCE_OF, ORDOS_IDS.types.investiture, null, null),
];

const edges: CausalEdge[] = [
  // REQUIRES — support. Edges run from=prerequisite to=dependent (types.ts convention).
  // Vaela's route:
  requires(ORDOS_IDS.edges.vaelaAcclaimedRequiresDeath, ORDOS_IDS.events.oldWardenDies, ORDOS_IDS.events.vaelaAcclaimed),
  // alternative sufficient causes (property 5): recognised by acclamation OR by settled blood
  requires(ORDOS_IDS.edges.vaelaRecognisedRequiresAcclaimed, ORDOS_IDS.events.vaelaAcclaimed, ORDOS_IDS.events.vaelaRecognised, "acclaim"),
  requires(ORDOS_IDS.edges.vaelaRecognisedRequiresBlood, ORDOS_IDS.facts.vaelaHeirValid, ORDOS_IDS.events.vaelaRecognised, "blood"),
  requires(ORDOS_IDS.edges.vaelaInvestedRequiresRecognised, ORDOS_IDS.events.vaelaRecognised, ORDOS_IDS.events.vaelaInvested),
  // Galen's route — every step runs through the load-bearing unknown (property 6):
  requires(ORDOS_IDS.edges.galenClaimsRequiresHeirProof, ORDOS_IDS.facts.heirClaimValid, ORDOS_IDS.events.galenClaimsInheritance),
  requires(ORDOS_IDS.edges.galenRecognisedRequiresClaims, ORDOS_IDS.events.galenClaimsInheritance, ORDOS_IDS.events.galenRecognised),
  requires(ORDOS_IDS.edges.galenInvestedRequiresRecognised, ORDOS_IDS.events.galenRecognised, ORDOS_IDS.events.galenInvested),
  // fact-gated events (property 4): the rite requires the Seal-held-by fact
  requires(ORDOS_IDS.edges.riteVaelaRequiresSealHeld, ORDOS_IDS.facts.sealHeldVaela, ORDOS_IDS.events.riteBindingVaela),
  requires(ORDOS_IDS.edges.riteGalenRequiresSealHeld, ORDOS_IDS.facts.sealHeldGalen, ORDOS_IDS.events.riteBindingGalen),
  // the settlement stands on either rite (alternative sufficient causes again)
  requires(ORDOS_IDS.edges.successionRequiresRiteVaela, ORDOS_IDS.events.riteBindingVaela, ORDOS_IDS.events.successionSettled, "acclaim"),
  requires(ORDOS_IDS.edges.successionRequiresRiteGalen, ORDOS_IDS.events.riteBindingGalen, ORDOS_IDS.events.successionSettled, "inherit"),
  // atemporal facts gate their events
  requires(ORDOS_IDS.edges.sealSurveyRequiresSilver, ORDOS_IDS.facts.sealIsSilver, ORDOS_IDS.events.sealSurvey),
  requires(ORDOS_IDS.edges.charterVetoRequiresCharter, ORDOS_IDS.facts.charterGrantsVeto, ORDOS_IDS.events.charterVetoInvoked, "charter"),
  requires(ORDOS_IDS.edges.charterVetoRequiresRecognition, ORDOS_IDS.events.galenRecognised, ORDOS_IDS.events.charterVetoInvoked, "charter"),
  // PRECEDES — two rival chains from the death; deliberately NO edges between them (property 7)
  precedes(ORDOS_IDS.edges.deathBeforeAcclaim, ORDOS_IDS.events.oldWardenDies, ORDOS_IDS.events.vaelaAcclaimed),
  precedes(ORDOS_IDS.edges.acclaimBeforeRecognition, ORDOS_IDS.events.vaelaAcclaimed, ORDOS_IDS.events.vaelaRecognised),
  precedes(ORDOS_IDS.edges.recognitionBeforeInvestiture, ORDOS_IDS.events.vaelaRecognised, ORDOS_IDS.events.vaelaInvested),
  precedes(ORDOS_IDS.edges.investitureBeforeRite, ORDOS_IDS.events.vaelaInvested, ORDOS_IDS.events.riteBindingVaela),
  precedes(ORDOS_IDS.edges.riteBeforeSettlement, ORDOS_IDS.events.riteBindingVaela, ORDOS_IDS.events.successionSettled),
  precedes(ORDOS_IDS.edges.deathBeforeClaims, ORDOS_IDS.events.oldWardenDies, ORDOS_IDS.events.galenClaimsInheritance),
  precedes(ORDOS_IDS.edges.claimsBeforeInheritanceInvestiture, ORDOS_IDS.events.galenClaimsInheritance, ORDOS_IDS.events.galenInvested),
  precedes(ORDOS_IDS.edges.inheritanceInvestitureBeforeRite, ORDOS_IDS.events.galenInvested, ORDOS_IDS.events.riteBindingGalen),
  precedes(ORDOS_IDS.edges.galenRiteBeforeSettlement, ORDOS_IDS.events.riteBindingGalen, ORDOS_IDS.events.successionSettled),
  // EXCLUDES — between two FACTS (property 3): at most one claimant holds the Seal
  excludes(ORDOS_IDS.edges.sealHolderExclusion, ORDOS_IDS.facts.sealHeldVaela, ORDOS_IDS.facts.sealHeldGalen),
];

const workBindings: WorkBinding[] = [
  // property 10: the investiture story holds only if the Seal is in Vaela's hands
  {
    workId: ORDOS_IDS.works.investitureOfVaela,
    events: [
      ORDOS_IDS.events.vaelaAcclaimed,
      ORDOS_IDS.events.vaelaRecognised,
      ORDOS_IDS.events.vaelaInvested,
      ORDOS_IDS.events.riteBindingVaela,
    ],
    facts: [ORDOS_IDS.facts.sealHeldVaela],
  },
  {
    workId: ORDOS_IDS.works.claimOfGalen,
    events: [
      ORDOS_IDS.events.galenClaimsInheritance,
      ORDOS_IDS.events.galenRecognised,
      ORDOS_IDS.events.galenInvested,
    ],
  },
  {
    workId: ORDOS_IDS.works.settlementOfSuccession,
    events: [ORDOS_IDS.events.riteBindingVaela, ORDOS_IDS.events.successionSettled],
  },
];

/**
 * The Ordos canon, freshly constructed with its content hash computed via
 * `hashCanon` at construction time. Deterministic across calls.
 */
export function ordosCanon(): Canon {
  const body = {
    canonId: ORDOS_IDS.canon,
    version: "1.0.0",
    entities: entities.map((e) => ({ ...e })),
    facts: facts.map((f) => ({ ...f })),
    edges: edges.map((e) => ({ ...e })),
    workBindings: workBindings.map((w) => ({ ...w, events: [...w.events] })),
    // The disputed parentage (property 6). Declaring the id here is how the
    // canon says "this gap is deliberate": a reference to an undeclared id is
    // structurally identical to a typo, so intent has to be stated. Without it,
    // validation would (correctly) call this a dangling reference.
    unspecified: [ORDOS_IDS.undeclared.heirProofSworn],
  };
  return { ...body, hash: hashCanon(body) };
}

/**
 * The single canonical Rewind Point: anchored at the Old Warden's death, the
 * moment the succession opens. The death is the temporal root, so the cut is
 * its own downward closure under PRECEDES.
 */
export function ordosRewindPoint(): RewindPoint {
  const canon = ordosCanon();
  return {
    id: ORDOS_IDS.rewindPoint.id,
    canonId: ORDOS_IDS.canon,
    anchorEvent: ANCHOR,
    cut: [...CUT],
    derivedHash: computeRewindHash(ORDOS_IDS.canon, ANCHOR, CUT, canon.hash),
    label: "The Old Warden Dies",
    tags: ["succession", "seal", "office"],
    created: ORDOS_IDS.rewindPoint.created,
  };
}
