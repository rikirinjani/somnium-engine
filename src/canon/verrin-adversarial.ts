/**
 * Somnium Engine — Verrin annex: adversarial stress fixture (P-003).
 *
 * A SEPARATE canon from the Verrin seed (`./verrin.ts`), reusing Verrin naming
 * (Valdar, Thornhollow, the Blight, Vara, Kael) so it reads as annex material
 * rather than a second fictional world. Every structure here exists to put one
 * of the engine's semantics under stress; the ids are part of the acceptance
 * contract in tests/acceptance/causal-acceptance.test.ts.
 *
 * Structure map (see `ADV_IDS` for the grouped ids):
 *   A  direct + indirect REQUIRES chain        ev/adv-blight -> ev/adv-exodus -> ev/adv-ashfall
 *   C  alternative sufficient causes           envoy | siege  -> council-meets
 *   D  conjunctive prerequisites               council AND scribe (group "quorum") -> treaty
 *   E  REQUIRES bootstrap cycle, grounded cycle, ENABLES-only cycle
 *   F  PRECEDES without causation + PRECEDES cycle
 *   G  MOTIVATES without necessity
 *   H  EXCLUDES satisfied in baseline + violated in baseline
 *   I  INVARIANT holding in baseline
 *   J  the baseline-EXCLUDES violation (feast/famine) is case J
 *   K  under-specification probe: `ev/adv-unspecified`
 *
 * Design notes:
 *  - `ev/adv-unspecified` is deliberately NEVER declared as an entity: it
 *    appears only as an edge endpoint (the case-K probe). Nodes that are only
 *    referenced, never declared, must stay UNKNOWN — absence of knowledge never
 *    becomes falsehood (see propagation.ts Phase A/B comments).
 *  - This canon intentionally contains REQUIRES cycles, a PRECES cycle and a
 *    baseline EXCLUDES violation (case J). It would therefore FAIL
 *    `validateCanon` (which requires REQUIRES/PRECEDES DAGs) — that is the
 *    point. It is a stress fixture, not a validatable seed.
 */
import { hashCanon } from "./hash";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "./types";

const CANON_ID = "canon/verrin-adversarial";

/** Every adversarial-structure id, grouped by case letter (A–K). */
export const ADV_IDS = Object.freeze({
  A: Object.freeze({ blight: "ev/adv-blight", exodus: "ev/adv-exodus", ashfall: "ev/adv-ashfall" }),
  C: Object.freeze({
    envoy: "ev/adv-envoy-arrives",
    siege: "ev/adv-siege-lifts",
    council: "ev/adv-council-meets",
  }),
  D: Object.freeze({
    council: "ev/adv-council-meets",
    scribe: "ev/adv-scribe-ready",
    treaty: "ev/adv-treaty",
  }),
  E: Object.freeze({
    bootA: "ev/adv-boot-a",
    bootB: "ev/adv-boot-b",
    groundA: "ev/adv-ground-a",
    groundB: "ev/adv-ground-b",
    softA: "ev/adv-soft-a",
    softB: "ev/adv-soft-b",
  }),
  F: Object.freeze({
    dawn: "ev/adv-dawn",
    dusk: "ev/adv-dusk",
    loopX: "ev/adv-loop-x",
    loopY: "ev/adv-loop-y",
  }),
  G: Object.freeze({ grief: "ev/adv-grief", vow: "ev/adv-vow" }),
  H: Object.freeze({
    guarded: "ev/adv-guarded",
    sacked: "ev/adv-sacked",
    feast: "ev/adv-feast",
    famine: "ev/adv-famine",
  }),
  I: Object.freeze({ oath: "ev/adv-oath", betrayal: "ev/adv-betrayal" }),
  J: Object.freeze({ feast: "ev/adv-feast", famine: "ev/adv-famine" }),
  K: Object.freeze({ rumour: "ev/adv-rumour", unspecified: "ev/adv-unspecified" }),
  WORKS: Object.freeze({ fall: "work/adv-fall", accord: "work/adv-accord" }),
  EDGES: Object.freeze({
    exodusRequiresBlight: "edge/adv-exodus-requires-blight",
    ashfallRequiresExodus: "edge/adv-ashfall-requires-exodus",
    councilRequiresEnvoy: "edge/adv-council-requires-envoy",
    councilRequiresSiege: "edge/adv-council-requires-siege",
    treatyRequiresCouncil: "edge/adv-treaty-requires-council",
    treatyRequiresScribe: "edge/adv-treaty-requires-scribe",
    bootARequiresB: "edge/adv-boot-a-requires-b",
    bootBRequiresA: "edge/adv-boot-b-requires-a",
    groundARequiresB: "edge/adv-ground-a-requires-b",
    groundBRequiresA: "edge/adv-ground-b-requires-a",
    groundARequiresBlight: "edge/adv-ground-a-requires-blight",
    softAEnablesB: "edge/adv-soft-a-enables-b",
    softBEnablesA: "edge/adv-soft-b-enables-a",
    softARequiresUnspecified: "edge/adv-soft-a-requires-unspecified",
    softBRequiresUnspecified: "edge/adv-soft-b-requires-unspecified",
    rumourRequiresUnspecified: "edge/adv-rumour-requires-unspecified",
    dawnBeforeDusk: "edge/adv-dawn-before-dusk",
    loopXBeforeY: "edge/adv-loop-x-before-y",
    loopYBeforeX: "edge/adv-loop-y-before-x",
    griefMotivatesVow: "edge/adv-grief-motivates-vow",
    vowRequiresBlight: "edge/adv-vow-requires-blight",
    guardedExcludesSacked: "edge/adv-guarded-excludes-sacked",
    sackedRequiresUnspecified: "edge/adv-sacked-requires-unspecified",
    feastExcludesFamine: "edge/adv-feast-excludes-famine",
    oathForbidsBetrayal: "edge/adv-oath-forbids-betrayal",
    betrayalRequiresUnspecified: "edge/adv-betrayal-requires-unspecified",
  }),
  FACTS: Object.freeze({
    varaValdar: "fact/adv-vara-valdar",
    varaThornhollow: "fact/adv-vara-thornhollow",
  }),
});

const entities: Entity[] = [
  // characters
  { id: "char/adv-vara", kind: "Character", name: "Vara", description: "Historian of Valdar; the annex fixture's viewpoint character." },
  // locations
  { id: "loc/adv-valdar", kind: "Location", name: "Valdar", description: "The city; Vara's home before the exodus." },
  { id: "loc/adv-thornhollow", kind: "Location", name: "Thornhollow", description: "The refuge beyond the Ashfall." },
  // case A — direct + indirect prerequisite chain (default group)
  { id: "ev/adv-blight", kind: "Event", name: "The Blight Stirring", description: "A corruption stirs beneath Valdar again." },
  { id: "ev/adv-exodus", kind: "Event", name: "The Exodus", description: "The citizens flee Valdar for Thornhollow." },
  { id: "ev/adv-ashfall", kind: "Event", name: "The Ashfall", description: "Cinders rain across the broken valley." },
  // case C — alternative sufficient causes (groups "envoy" / "siege")
  { id: "ev/adv-envoy-arrives", kind: "Event", name: "The Envoy Arrives", description: "An Ember Court envoy reaches the council hall." },
  { id: "ev/adv-siege-lifts", kind: "Event", name: "The Siege Lifts", description: "The besieging host withdraws from the walls." },
  { id: "ev/adv-council-meets", kind: "Event", name: "The Council Meets", description: "Valdar's council convenes." },
  // case D — conjunctive prerequisites (group "quorum")
  { id: "ev/adv-scribe-ready", kind: "Event", name: "The Scribe Is Ready", description: "The charter scribe has finished the fair copy." },
  { id: "ev/adv-treaty", kind: "Event", name: "The Treaty Is Sealed", description: "The treaty is sealed before the council." },
  // case E — REQUIRES bootstrap cycle, grounded cycle, ENABLES-only cycle
  { id: "ev/adv-boot-a", kind: "Event", name: "The Bootstrap Turn A", description: "Half a self-supporting ritual; no external ground." },
  { id: "ev/adv-boot-b", kind: "Event", name: "The Bootstrap Turn B", description: "The other half of the self-supporting ritual." },
  { id: "ev/adv-ground-a", kind: "Event", name: "The Grounded Turn A", description: "A cycle turn with an external anchor (the Blight)." },
  { id: "ev/adv-ground-b", kind: "Event", name: "The Grounded Turn B", description: "The counterpart of the externally grounded turn." },
  { id: "ev/adv-soft-a", kind: "Event", name: "The Soft Cycle Turn A", description: "Soft access; its hard path runs through the unspecified." },
  { id: "ev/adv-soft-b", kind: "Event", name: "The Soft Cycle Turn B", description: "Soft counterpart of the soft-cycle turn." },
  // case K — under-specification probe (ev/adv-unspecified is NOT declared)
  { id: "ev/adv-rumour", kind: "Event", name: "The Rumour Spreads", description: "A rumour spreads through Thornhollow." },
  // case F — PRECEDES without causation + PRECEDES cycle
  { id: "ev/adv-dawn", kind: "Event", name: "Dawn Over Thornhollow", description: "Morning arrives; order, not cause." },
  { id: "ev/adv-dusk", kind: "Event", name: "Dusk Over Thornhollow", description: "Evening falls after the dawn." },
  { id: "ev/adv-loop-x", kind: "Event", name: "The Hourglass Turn X", description: "A temporal turn that cannot be linearized." },
  { id: "ev/adv-loop-y", kind: "Event", name: "The Hourglass Turn Y", description: "The counterpart of the unlinearizable turn." },
  // case G — MOTIVATES without necessity
  { id: "ev/adv-grief", kind: "Event", name: "Vara's Grief", description: "Vara grieves what the blight took." },
  { id: "ev/adv-vow", kind: "Event", name: "Vara's Vow", description: "Vara vows to return and rebuild Valdar." },
  // case H — EXCLUDES, satisfied and violated in baseline
  { id: "ev/adv-guarded", kind: "Event", name: "The Gates Stay Guarded", description: "The gates are held; the town is not sacked." },
  { id: "ev/adv-sacked", kind: "Event", name: "Thornhollow Is Sacked", description: "The refuge falls to raiders — unreachable in baseline." },
  { id: "ev/adv-feast", kind: "Event", name: "The Harvest Feast", description: "The harvest feast is held — and so is the famine winter." },
  { id: "ev/adv-famine", kind: "Event", name: "The Famine Winter", description: "The famine winter comes — and so does the feast." },
  // case I — INVARIANT
  { id: "ev/adv-oath", kind: "Event", name: "Kael Renews the Oath", description: "Kael renews the oath of protection." },
  { id: "ev/adv-betrayal", kind: "Event", name: "The Betrayal", description: "The gates opened from within — forbidden while the oath holds." },
  // works
  { id: "work/adv-fall", kind: "Work", name: "Annex: The Fall", description: "The annex chain: blight, exodus, ashfall." },
  { id: "work/adv-accord", kind: "Work", name: "Annex: The Accord", description: "The council meeting and the sealed treaty." },
];

const facts: Fact[] = [
  // Vara's location flips exactly at the exodus (validity windows).
  { id: "fact/adv-vara-valdar", subject: "char/adv-vara", predicate: "located_in", object: "loc/adv-valdar", validFrom: null, validTo: "ev/adv-exodus", source: "canon" },
  { id: "fact/adv-vara-thornhollow", subject: "char/adv-vara", predicate: "located_in", object: "loc/adv-thornhollow", validFrom: "ev/adv-exodus", validTo: null, source: "canon" },
];

const edges: CausalEdge[] = [
  // case A — direct + indirect REQUIRES chain (default group, no `group` key)
  { id: "edge/adv-exodus-requires-blight", kind: "REQUIRES", from: "ev/adv-blight", to: "ev/adv-exodus", note: "The exodus is impossible without the blight." },
  { id: "edge/adv-ashfall-requires-exodus", kind: "REQUIRES", from: "ev/adv-exodus", to: "ev/adv-ashfall", note: "Ashfall follows only after the roads empty." },
  // case C — alternative sufficient causes: two DISTINCT groups
  { id: "edge/adv-council-requires-envoy", kind: "REQUIRES", from: "ev/adv-envoy-arrives", to: "ev/adv-council-meets", group: "envoy", note: "An envoy can convene the council." },
  { id: "edge/adv-council-requires-siege", kind: "REQUIRES", from: "ev/adv-siege-lifts", to: "ev/adv-council-meets", group: "siege", note: "A lifted siege can convene the council." },
  // case D — conjunctive prerequisites: ONE group, TWO conjuncts
  { id: "edge/adv-treaty-requires-council", kind: "REQUIRES", from: "ev/adv-council-meets", to: "ev/adv-treaty", group: "quorum", note: "The treaty needs a convened council." },
  { id: "edge/adv-treaty-requires-scribe", kind: "REQUIRES", from: "ev/adv-scribe-ready", to: "ev/adv-treaty", group: "quorum", note: "The treaty needs the scribe's fair copy." },
  // case E — REQUIRES bootstrap cycle (no external ground)
  { id: "edge/adv-boot-a-requires-b", kind: "REQUIRES", from: "ev/adv-boot-b", to: "ev/adv-boot-a", note: "Turn A requires turn B — nothing else." },
  { id: "edge/adv-boot-b-requires-a", kind: "REQUIRES", from: "ev/adv-boot-a", to: "ev/adv-boot-b", note: "Turn B requires turn A — nothing else." },
  // case E — grounded cycle: same mutual REQUIRES plus an external group
  { id: "edge/adv-ground-a-requires-b", kind: "REQUIRES", from: "ev/adv-ground-b", to: "ev/adv-ground-a" },
  { id: "edge/adv-ground-b-requires-a", kind: "REQUIRES", from: "ev/adv-ground-a", to: "ev/adv-ground-b" },
  { id: "edge/adv-ground-a-requires-blight", kind: "REQUIRES", from: "ev/adv-blight", to: "ev/adv-ground-a", group: "external", note: "The blight externally grounds the cycle." },
  // case E — ENABLES-only cycle: soft access both ways, hard path unresolved
  { id: "edge/adv-soft-a-enables-b", kind: "ENABLES", from: "ev/adv-soft-a", to: "ev/adv-soft-b", note: "Turn A softens the way to turn B." },
  { id: "edge/adv-soft-b-enables-a", kind: "ENABLES", from: "ev/adv-soft-b", to: "ev/adv-soft-a", note: "Turn B softens the way to turn A." },
  { id: "edge/adv-soft-a-requires-unspecified", kind: "REQUIRES", from: "ev/adv-unspecified", to: "ev/adv-soft-a", note: "Hard path runs through the unspecified." },
  { id: "edge/adv-soft-b-requires-unspecified", kind: "REQUIRES", from: "ev/adv-unspecified", to: "ev/adv-soft-b", note: "Hard path runs through the unspecified." },
  // case K — under-specification probe
  { id: "edge/adv-rumour-requires-unspecified", kind: "REQUIRES", from: "ev/adv-unspecified", to: "ev/adv-rumour", note: "The rumour needs a source the canon never names." },
  // case F — PRECEDES without causation + PRECEDES cycle
  { id: "edge/adv-dawn-before-dusk", kind: "PRECEDES", from: "ev/adv-dawn", to: "ev/adv-dusk", note: "Dawn precedes dusk; it does not cause it." },
  { id: "edge/adv-loop-x-before-y", kind: "PRECEDES", from: "ev/adv-loop-x", to: "ev/adv-loop-y", note: "An unlinearizable temporal pair." },
  { id: "edge/adv-loop-y-before-x", kind: "PRECEDES", from: "ev/adv-loop-y", to: "ev/adv-loop-x", note: "The other direction of the unlinearizable pair." },
  // case G — MOTIVATES without necessity
  { id: "edge/adv-grief-motivates-vow", kind: "MOTIVATES", from: "ev/adv-grief", to: "ev/adv-vow", note: "Grief moves Vara to vow — it does not ground the vow." },
  { id: "edge/adv-vow-requires-blight", kind: "REQUIRES", from: "ev/adv-blight", to: "ev/adv-vow", note: "The vow is born from the blight — its real support." },
  // case H — EXCLUDES, satisfied in baseline (guarded) and violated in baseline (feast/famine)
  { id: "edge/adv-guarded-excludes-sacked", kind: "EXCLUDES", from: "ev/adv-guarded", to: "ev/adv-sacked", note: "Guarded gates and a sacked town cannot both hold." },
  { id: "edge/adv-sacked-requires-unspecified", kind: "REQUIRES", from: "ev/adv-unspecified", to: "ev/adv-sacked", note: "The sack needs a cause the canon never names." },
  { id: "edge/adv-feast-excludes-famine", kind: "EXCLUDES", from: "ev/adv-feast", to: "ev/adv-famine", note: "A harvest feast and a famine winter cannot both hold." },
  // case I — INVARIANT, directed prohibition holding in baseline
  { id: "edge/adv-oath-forbids-betrayal", kind: "INVARIANT", from: "ev/adv-oath", to: "ev/adv-betrayal", note: "Authorial rule: while the oath holds, the betrayal is forbidden." },
  { id: "edge/adv-betrayal-requires-unspecified", kind: "REQUIRES", from: "ev/adv-unspecified", to: "ev/adv-betrayal", note: "The betrayal needs a conspiracy the canon never names." },
];

const workBindings: WorkBinding[] = [
  { workId: "work/adv-fall", events: ["ev/adv-blight", "ev/adv-exodus", "ev/adv-ashfall"] },
  { workId: "work/adv-accord", events: ["ev/adv-council-meets", "ev/adv-treaty"] },
];

/**
 * The adversarial canon, freshly constructed with its content hash computed via
 * `hashCanon` at construction time. Deterministic across calls (each call is a
 * fresh copy of the same content with the same hash).
 */
export function verrinAdversarialCanon(): Canon {
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
