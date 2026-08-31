/**
 * Somnium Engine — causal acceptance suite (P-003), adversarial fixture.
 *
 * Drives `verrinAdversarialCanon` (src/canon/verrin-adversarial.ts) through the
 * staged pipeline and asserts exactly what propagation.ts's header documents:
 * grouped alternative/conjunctive REQUIRES, well-founded cycles, the four
 * inert-but-real edge kinds (ENABLES/MOTIVATES/PRECES/EXCLUDES/INVARIANT),
 * contradiction provenance, and the under-specification probe
 * (`ev/adv-unspecified` is never declared).
 *
 * Every assertion is a concrete expected value. Where the spec and the engine
 * disagree, this suite must be reported as a finding — not silently bent.
 */
import { describe, expect, it } from "vitest";
import { hashCanon } from "../../src/canon/hash";
import { ADV_IDS, verrinAdversarialCanon } from "../../src/canon/verrin-adversarial";
import { derive } from "../../src/derive/world-state";
import { statusOf, workStatusOf } from "../../src/query/status";
import { forceEvent, negateEvent, severEdge } from "../../src/timeline/types";

const ids = ADV_IDS;

/* -------------------------------------------------------------------------- */
/* fixture structure                                                          */
/* -------------------------------------------------------------------------- */

describe("canon fixture: verrinAdversarialCanon", () => {
  const canon = verrinAdversarialCanon();

  it("is a separate, deterministically-hashed canon", () => {
    expect(canon.canonId).toBe("canon/verrin-adversarial");
    expect(canon.version).toBe("1.0.0");
    expect(canon.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(canon.hash).toBe(hashCanon(canon));
    expect(verrinAdversarialCanon().hash).toBe(canon.hash);
  });

  it("declares every event as an entity", () => {
    const eventIds = new Set(canon.entities.filter((e) => e.kind === "Event").map((e) => e.id));
    const expected = [
      ids.A.blight, ids.A.exodus, ids.A.ashfall,
      ids.C.envoy, ids.C.siege, ids.C.council,
      ids.D.scribe, ids.D.treaty,
      ids.E.bootA, ids.E.bootB, ids.E.groundA, ids.E.groundB, ids.E.softA, ids.E.softB,
      ids.K.rumour,
      ids.F.dawn, ids.F.dusk, ids.F.loopX, ids.F.loopY,
      ids.G.grief, ids.G.vow,
      ids.H.guarded, ids.H.sacked, ids.H.feast, ids.H.famine,
      ids.I.oath, ids.I.betrayal,
    ];
    for (const id of expected) {
      expect(eventIds.has(id)).toBe(true);
    }
  });

  it("never declares ev/adv-unspecified — it is referenced only as an edge endpoint", () => {
    expect(canon.entities.some((e) => e.id === ids.K.unspecified)).toBe(false);
    expect(canon.facts.some((f) => f.id === ids.K.unspecified)).toBe(false);
    const touching = canon.edges.filter((e) => e.from === ids.K.unspecified || e.to === ids.K.unspecified);
    // soft-a, soft-b, rumour, sacked, betrayal — five REQUIRES into it
    expect(touching).toHaveLength(5);
    for (const e of touching) {
      expect(e.from).toBe(ids.K.unspecified);
    }
  });

  it("declares the characters, locations, works and validity-window facts", () => {
    const entityIds = new Set(canon.entities.map((e) => e.id));
    for (const id of ["char/adv-vara", "loc/adv-valdar", "loc/adv-thornhollow", ids.WORKS.fall, ids.WORKS.accord]) {
      expect(entityIds.has(id)).toBe(true);
    }
    const inValdar = canon.facts.find((f) => f.id === ids.FACTS.varaValdar);
    expect(inValdar).toMatchObject({
      subject: "char/adv-vara",
      predicate: "located_in",
      object: "loc/adv-valdar",
      validFrom: null,
      validTo: ids.A.exodus,
    });
    const inThornhollow = canon.facts.find((f) => f.id === ids.FACTS.varaThornhollow);
    expect(inThornhollow).toMatchObject({
      subject: "char/adv-vara",
      predicate: "located_in",
      object: "loc/adv-thornhollow",
      validFrom: ids.A.exodus,
      validTo: null,
    });
    const fall = canon.workBindings.find((w) => w.workId === ids.WORKS.fall);
    expect(fall?.events).toEqual([ids.A.blight, ids.A.exodus, ids.A.ashfall]);
    const accord = canon.workBindings.find((w) => w.workId === ids.WORKS.accord);
    expect(accord?.events).toEqual([ids.D.council, ids.D.treaty]);
  });

  it("carries the exact REQUIRES groups (alternative vs conjunctive)", () => {
    const edge = (id: string) => canon.edges.find((e) => e.id === id);
    // alternative sufficient causes: two DISTINCT groups
    expect(edge(ids.EDGES.councilRequiresEnvoy)).toMatchObject({
      kind: "REQUIRES", from: ids.C.envoy, to: ids.C.council, group: "envoy",
    });
    expect(edge(ids.EDGES.councilRequiresSiege)).toMatchObject({
      kind: "REQUIRES", from: ids.C.siege, to: ids.C.council, group: "siege",
    });
    // conjunctive prerequisites: ONE shared group
    expect(edge(ids.EDGES.treatyRequiresCouncil)).toMatchObject({
      kind: "REQUIRES", from: ids.D.council, to: ids.D.treaty, group: "quorum",
    });
    expect(edge(ids.EDGES.treatyRequiresScribe)).toMatchObject({
      kind: "REQUIRES", from: ids.D.scribe, to: ids.D.treaty, group: "quorum",
    });
    // grounded cycle: external group
    expect(edge(ids.EDGES.groundARequiresBlight)).toMatchObject({
      kind: "REQUIRES", from: ids.A.blight, to: ids.E.groundA, group: "external",
    });
    // default-group REQUIRES edges carry NO `group` key at all (absent key is
    // absent from the content hash — types.ts convention)
    const chain = edge(ids.EDGES.exodusRequiresBlight);
    expect(chain?.kind).toBe("REQUIRES");
    expect(chain?.from).toBe(ids.A.blight);
    expect(chain?.to).toBe(ids.A.exodus);
    expect(chain?.group).toBeUndefined();
  });

  it("exercises every edge kind", () => {
    const kinds = new Set(canon.edges.map((e) => e.kind));
    for (const kind of ["REQUIRES", "ENABLES", "MOTIVATES", "PRECEDES", "EXCLUDES", "INVARIANT"]) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* case A — direct prerequisite removal                                        */
/* -------------------------------------------------------------------------- */

describe("case A: direct prerequisite removal", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);
  const world = derive(canon, [negateEvent(ids.A.blight)]);

  it("baseline: the whole chain is ESTABLISHED", () => {
    expect(statusOf(base, ids.A.blight)).toBe("ESTABLISHED");
    expect(statusOf(base, ids.A.exodus)).toBe("ESTABLISHED");
    expect(statusOf(base, ids.A.ashfall)).toBe("ESTABLISHED");
  });

  it("negating the blight refutes the direct dependent", () => {
    expect(statusOf(world, ids.A.exodus)).toBe("UNSUPPORTED");
  });

  it("the negated node itself is EXCLUDED (input), not UNSUPPORTED (conclusion)", () => {
    expect(statusOf(world, ids.A.blight)).toBe("EXCLUDED");
    expect(statusOf(world, ids.A.exodus)).toBe("UNSUPPORTED");
    // the two judgments differ exactly on the intervention INPUT flag
    expect(world.judgments[ids.A.blight]?.negated).toBe(true);
    expect(world.judgments[ids.A.exodus]?.negated).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* case B — indirect removal                                                   */
/* -------------------------------------------------------------------------- */

describe("case B: indirect removal", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);
  const world = derive(canon, [negateEvent(ids.A.blight)]);

  it("ashfall is UNSUPPORTED transitively through exodus", () => {
    expect(statusOf(world, ids.A.ashfall)).toBe("UNSUPPORTED");
  });

  it("the fall work is IMPOSSIBLE in the branch", () => {
    expect(workStatusOf(base, ids.WORKS.fall)).toBe("PRESERVED");
    expect(workStatusOf(world, ids.WORKS.fall)).toBe("IMPOSSIBLE");
  });
});

/* -------------------------------------------------------------------------- */
/* case C — alternative sufficient causes                                      */
/* -------------------------------------------------------------------------- */

describe("case C: alternative sufficient causes", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);
  const envoyGone = derive(canon, [negateEvent(ids.C.envoy)]);
  const bothGone = derive(canon, [negateEvent(ids.C.envoy), negateEvent(ids.C.siege)]);

  it("baseline: both sufficient causes hold, so the council meets", () => {
    expect(statusOf(base, ids.C.envoy)).toBe("ESTABLISHED");
    expect(statusOf(base, ids.C.siege)).toBe("ESTABLISHED");
    expect(statusOf(base, ids.C.council)).toBe("ESTABLISHED");
  });

  it("headline fix: removing ONE sufficient cause does NOT kill the effect", () => {
    expect(statusOf(envoyGone, ids.C.envoy)).toBe("EXCLUDED");
    expect(statusOf(envoyGone, ids.C.siege)).toBe("ESTABLISHED");
    expect(statusOf(envoyGone, ids.C.council)).toBe("ESTABLISHED");
  });

  it("removing BOTH sufficient causes refutes the effect", () => {
    expect(statusOf(bothGone, ids.C.envoy)).toBe("EXCLUDED");
    expect(statusOf(bothGone, ids.C.siege)).toBe("EXCLUDED");
    expect(statusOf(bothGone, ids.C.council)).toBe("UNSUPPORTED");
  });
});

/* -------------------------------------------------------------------------- */
/* case D — conjunctive prerequisites                                          */
/* -------------------------------------------------------------------------- */

describe("case D: conjunctive prerequisites", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);
  const world = derive(canon, [negateEvent(ids.D.scribe)]);

  // Contrast with case C: the two quorum REQUIRES edges share a GROUP, so they
  // are CONJUNCTS of one sufficient set — losing any one conjunct refutes the
  // group. Case C's two groups are ALTERNATIVE sufficient sets — losing one
  // leaves the other intact. Same "remove one prerequisite" intervention,
  // different outcome, decided purely by the group key.
  it("one missing conjunct refutes the treaty", () => {
    expect(statusOf(base, ids.D.treaty)).toBe("ESTABLISHED");
    expect(statusOf(world, ids.D.scribe)).toBe("EXCLUDED");
    expect(statusOf(world, ids.D.treaty)).toBe("UNSUPPORTED");
  });

  it("the council is untouched — it has its own alternative support", () => {
    expect(statusOf(world, ids.D.council)).toBe("ESTABLISHED");
  });
});

/* -------------------------------------------------------------------------- */
/* case E — cycles                                                             */
/* -------------------------------------------------------------------------- */

describe("case E: cycles", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);

  it("bootstrap cycle: both nodes UNSUPPORTED with UNFOUNDED support and NO contradiction record", () => {
    expect(statusOf(base, ids.E.bootA)).toBe("UNSUPPORTED");
    expect(statusOf(base, ids.E.bootB)).toBe("UNSUPPORTED");
    expect(base.judgments[ids.E.bootA]?.support).toBe("UNFOUNDED");
    expect(base.judgments[ids.E.bootB]?.support).toBe("UNFOUNDED");
    // an unfounded cycle is consistent, just ungrounded — it is not a conflict
    expect(base.contradictions.some((c) => c.a === ids.E.bootA || c.b === ids.E.bootA)).toBe(false);
    expect(base.contradictions.some((c) => c.a === ids.E.bootB || c.b === ids.E.bootB)).toBe(false);
  });

  it("grounded cycle: the external group grounds BOTH nodes", () => {
    expect(statusOf(base, ids.E.groundA)).toBe("ESTABLISHED");
    expect(statusOf(base, ids.E.groundB)).toBe("ESTABLISHED");
  });

  it("ENABLES-only cycle: both UNKNOWN, never ESTABLISHED, never UNSUPPORTED", () => {
    expect(statusOf(base, ids.E.softA)).toBe("UNKNOWN");
    expect(statusOf(base, ids.E.softB)).toBe("UNKNOWN");
    expect(base.judgments[ids.E.softA]?.truth).toBe("NEITHER");
    expect(base.judgments[ids.E.softB]?.truth).toBe("NEITHER");
  });
});

/* -------------------------------------------------------------------------- */
/* case F — PRECEDES without causation                                         */
/* -------------------------------------------------------------------------- */

describe("case F: PRECEDES without causation", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);
  const noDawn = derive(canon, [negateEvent(ids.F.dawn)]);

  it("ordering is not support: dusk stays ESTABLISHED when dawn is negated", () => {
    expect(statusOf(base, ids.F.dawn)).toBe("ESTABLISHED");
    expect(statusOf(noDawn, ids.F.dawn)).toBe("EXCLUDED");
    expect(statusOf(noDawn, ids.F.dusk)).toBe("ESTABLISHED");
  });

  it("the PRECEDES cycle is a temporal violation, not a status defect", () => {
    expect(statusOf(base, ids.F.loopX)).toBe("ESTABLISHED");
    expect(statusOf(base, ids.F.loopY)).toBe("ESTABLISHED");
    expect(base.temporalViolations).toHaveLength(1);
    const v = base.temporalViolations[0];
    expect(v?.nodes).toEqual([ids.F.loopX, ids.F.loopY]);
    expect(v?.edgeIds).toEqual([ids.EDGES.loopXBeforeY, ids.EDGES.loopYBeforeX]);
  });
});

/* -------------------------------------------------------------------------- */
/* case G — MOTIVATES without necessity                                        */
/* -------------------------------------------------------------------------- */

describe("case G: MOTIVATES without necessity", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);
  const severed = derive(canon, [severEdge(ids.EDGES.griefMotivatesVow)]);
  const noGrief = derive(canon, [negateEvent(ids.G.grief)]);

  it("severing the MOTIVATES edge leaves every status identical — it was never load-bearing", () => {
    expect(severed.statuses).toEqual(base.statuses);
  });

  it("negating the motivator leaves the vow ESTABLISHED via its own REQUIRES", () => {
    expect(statusOf(base, ids.G.grief)).toBe("ESTABLISHED");
    expect(statusOf(noGrief, ids.G.grief)).toBe("EXCLUDED");
    expect(statusOf(noGrief, ids.G.vow)).toBe("ESTABLISHED");
  });
});

/* -------------------------------------------------------------------------- */
/* case H — EXCLUDES                                                           */
/* -------------------------------------------------------------------------- */

describe("case H: EXCLUDES", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);

  it("satisfied pair: no contradiction; the non-occurring side is UNKNOWN, not EXCLUDED", () => {
    expect(statusOf(base, ids.H.guarded)).toBe("ESTABLISHED");
    expect(statusOf(base, ids.H.sacked)).toBe("UNKNOWN");
    expect(
      base.contradictions.some(
        (c) =>
          c.a === ids.H.guarded || c.b === ids.H.guarded ||
          c.a === ids.H.sacked || c.b === ids.H.sacked
      )
    ).toBe(false);
  });

  it("violated pair: BOTH endpoints CONTRADICTORY with one record each, never EXCLUDED", () => {
    expect(statusOf(base, ids.H.feast)).toBe("CONTRADICTORY");
    expect(statusOf(base, ids.H.famine)).toBe("CONTRADICTORY");
    const records = base.contradictions.filter(
      (c) =>
        c.a === ids.H.feast || c.b === ids.H.feast ||
        c.a === ids.H.famine || c.b === ids.H.famine
    );
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.source).toBe("canon");
    }
    // CONTRADICTORY, not EXCLUDED/UNSUPPORTED: EXCLUDED denotes an intervention
    // that removed an event (do(X never happens) — an INPUT), and UNSUPPORTED a
    // DERIVED false. Here no intervention ran and both events' hard paths hold;
    // the world itself asserts an impossibility, so both endpoints are
    // contradictory with provenance — exactly as propagation.ts Phase D.2 says.
    expect(statusOf(base, ids.H.feast)).not.toBe("EXCLUDED");
    expect(statusOf(base, ids.H.feast)).not.toBe("UNSUPPORTED");
    expect(statusOf(base, ids.H.famine)).not.toBe("EXCLUDED");
    expect(statusOf(base, ids.H.famine)).not.toBe("UNSUPPORTED");
  });
});

/* -------------------------------------------------------------------------- */
/* case I — INVARIANT                                                          */
/* -------------------------------------------------------------------------- */

describe("case I: INVARIANT", () => {
  const canon = verrinAdversarialCanon();
  const base = derive(canon, []);
  const forced = derive(canon, [forceEvent(ids.I.betrayal)]);

  it("baseline holds silently: no invariant record", () => {
    expect(statusOf(base, ids.I.oath)).toBe("ESTABLISHED");
    expect(
      base.contradictions.some(
        (c) =>
          c.a === ids.I.oath || c.b === ids.I.oath ||
          c.a === ids.I.betrayal || c.b === ids.I.betrayal
      )
    ).toBe(false);
  });

  it("forcing the target violates the invariant: target CONTRADICTORY, source untainted, provenance intact", () => {
    expect(statusOf(forced, ids.I.betrayal)).toBe("CONTRADICTORY");
    expect(statusOf(forced, ids.I.oath)).toBe("ESTABLISHED");
    const rec = forced.contradictions.find((c) => c.a === ids.I.oath && c.b === ids.I.betrayal);
    expect(rec).toBeDefined();
    expect(rec?.source).toBe("canon");
  });
});

/* -------------------------------------------------------------------------- */
/* case J — contradictory canon                                                */
/* -------------------------------------------------------------------------- */

describe("case J: contradictory canon", () => {
  const canon = verrinAdversarialCanon();
  // NO interventions at all — the canon itself is contradictory.
  const world = derive(canon, []);

  it("the feast/famine pair is contradictory in the baseline with provenance 'canon'", () => {
    const records = world.contradictions.filter(
      (c) =>
        c.a === ids.J.feast || c.b === ids.J.feast ||
        c.a === ids.J.famine || c.b === ids.J.famine
    );
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.source).toBe("canon");
      expect(r.id).toContain("excludes");
    }
  });

  it("derive still returns a usable world — the contradiction is preserved, not repaired, not fatal", () => {
    expect(world.identityHash).toMatch(/^[0-9a-f]{8}$/);
    expect(world.contradictions.length).toBe(2);
    // unrelated events remain ESTABLISHED despite the contradictory pair
    expect(statusOf(world, ids.A.blight)).toBe("ESTABLISHED");
    expect(statusOf(world, ids.F.dawn)).toBe("ESTABLISHED");
    expect(statusOf(world, ids.I.oath)).toBe("ESTABLISHED");
    expect(statusOf(world, ids.C.council)).toBe("ESTABLISHED");
  });
});

/* -------------------------------------------------------------------------- */
/* case K — under-specification                                                */
/* -------------------------------------------------------------------------- */

describe("case K: under-specification", () => {
  const canon = verrinAdversarialCanon();
  const world = derive(canon, []);

  it("the undeclared node is UNKNOWN — absence of knowledge never becomes falsehood", () => {
    expect(statusOf(world, ids.K.unspecified)).toBe("UNKNOWN");
    expect(statusOf(world, ids.K.unspecified)).not.toBe("UNSUPPORTED");
    expect(statusOf(world, ids.K.unspecified)).not.toBe("EXCLUDED");
  });

  it("its dependent is UNKNOWN for the same reason", () => {
    expect(statusOf(world, ids.K.rumour)).toBe("UNKNOWN");
    expect(statusOf(world, ids.K.rumour)).not.toBe("UNSUPPORTED");
    expect(statusOf(world, ids.K.rumour)).not.toBe("EXCLUDED");
  });

  it("in the SAME world, the bootstrap cycle is UNSUPPORTED — a visibly distinct reason for not-true", () => {
    // Two ways for a node to be not-true coexist here: epistemic absence
    // (under-specification -> UNKNOWN, support NONE) and well-founded falsehood
    // (unfounded cycle -> UNSUPPORTED, support UNFOUNDED).
    expect(statusOf(world, ids.E.bootA)).toBe("UNSUPPORTED");
    expect(world.judgments[ids.E.bootA]?.support).toBe("UNFOUNDED");
    expect(world.judgments[ids.K.unspecified]?.support).toBe("NONE");
  });
});

/* -------------------------------------------------------------------------- */
/* determinism and replay                                                      */
/* -------------------------------------------------------------------------- */

describe("determinism and replay", () => {
  it("derive twice with a multi-intervention chain => identical world", () => {
    const canon = verrinAdversarialCanon();
    const chain = [
      negateEvent(ids.C.envoy),
      forceEvent(ids.I.betrayal),
      severEdge(ids.EDGES.griefMotivatesVow),
    ];
    const a = derive(canon, chain);
    const b = derive(canon, chain);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.judgments).toEqual(b.judgments);
    expect(a.statuses).toEqual(b.statuses);
    expect(a.contradictions).toEqual(b.contradictions);
    expect(a.temporalViolations).toEqual(b.temporalViolations);
  });
});
