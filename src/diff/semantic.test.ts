/**
 * Somnium Engine — P-007 semantic WorldDiff prediction suite.
 *
 * Every test here maps to a falsifiable prediction in
 * experiments/p007/predictions.md (written BEFORE implementation). The ncr-004
 * rule applies throughout: any claim about "both seed canons" is a
 * parameterized test (it.each over {verrin, ordos}), never prose.
 *
 *   INV  — the central invariant: diff(A,B) empty ⟺ stateHash(A)===stateHash(B)
 *           (same canon), swept across every §13 mutation/derivation route.
 *   H2   — record churn is not semantic change (empty diff AND equal hash).
 *   H3   — effective state change is observable (the cascade).
 *   H5   — constraint-only change has deterministic diff identity.
 *   H6   — diff direction matters (directed, not symmetric).
 *   H7   — diffs do NOT form a composition algebra (cancellation witness).
 *   D4   — ALTERED is value-based (idempotent touch is invisible).
 *   D5   — content comparison, not id comparison (id-colliding records differ).
 *   D8   — occurrence identity: substituting one occurrence is visible.
 *   D9   — INV is scoped same-canon (cross-canon documented, not universal).
 *   D10  — deterministic diff generation.
 */
import { describe, expect, it } from "vitest";
import { verrinCanon } from "../canon/verrin";
import { ordosCanon, ORDOS_IDS } from "../canon/ordos";
import { derive } from "../derive/world-state";
import type { WorldState } from "../derive/world-state";
import { worldDiff } from "./diff";
import type { WorldDiff } from "./types";
import {
  addEdge,
  forceEvent,
  negateEvent,
  relocate,
  setFact,
  severEdge,
} from "../timeline/types";
import type { Intervention } from "../timeline/types";
import { INSTANCE_OF } from "../canon/types";
import type { Canon, CausalEdge, Entity, Fact } from "../canon/types";
import { hashCanon } from "../canon/hash";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function diffEmpty(d: WorldDiff): boolean {
  return (
    d.statusChanges.length === 0 &&
    d.factAdditions.length === 0 &&
    d.factRemovals.length === 0 &&
    d.factOverrides.length === 0 &&
    d.edgeChanges.length === 0 &&
    d.contradictionsIntroduced.length === 0 &&
    d.contradictionsResolved.length === 0 &&
    d.constraintViolationsIntroduced.length === 0 &&
    d.constraintViolationsResolved.length === 0 &&
    d.temporalViolationsIntroduced.length === 0 &&
    d.temporalViolationsResolved.length === 0 &&
    d.reachabilityChanges.length === 0 &&
    d.workStatusChanges.length === 0
  );
}

interface Route {
  name: string;
  ivs: Intervention[];
}

/** Every §13 route that exists on Verrin's structure. */
function verrinRoutes(v: Canon): Route[] {
  const oathEdge = v.edges.find((e) => e.id === "edge/kael-oath-requires-blight");
  if (oathEdge === undefined) throw new Error("verrin fixture: oath edge missing");
  return [
    { name: "negate-root", ivs: [negateEvent("ev/blight-begins")] },
    { name: "force-established (provenance-only)", ivs: [forceEvent("ev/blight-begins")] },
    { name: "idempotent-setfact", ivs: [setFact("char/kael", "sibling_of", "char/vara")] },
    { name: "real-override", ivs: [setFact("char/kael", "sibling_of", "char/maren")] },
    { name: "sever-load-bearing", ivs: [severEdge("edge/kael-oath-requires-blight")] },
    { name: "sever-readd-net-zero", ivs: [severEdge("edge/kael-oath-requires-blight"), addEdge(oathEdge)] },
    { name: "sever-nonexistent (no-op)", ivs: [severEdge("edge/does-not-exist")] },
    { name: "refused-write", ivs: [setFact("char/vara", "located_in", "type/ghost")] },
    { name: "force-negate (contradiction)", ivs: [forceEvent("ev/exodus"), negateEvent("ev/exodus")] },
    {
      name: "precedes-cycle (temporal)",
      ivs: [addEdge({ id: "edge/probe-vow-before-exodus", kind: "PRECEDES", from: "ev/vara-vow", to: "ev/exodus" })],
    },
    { name: "negate-one-occurrence", ivs: [negateEvent("ev/kael-oath")] },
  ];
}

/** Every §13 route that exists on Ordos's structure (plus the constraint routes). */
function ordosRoutes(o: Canon): Route[] {
  const acclaimEdge = o.edges.find((e) => e.id === ORDOS_IDS.edges.vaelaAcclaimedRequiresDeath);
  if (acclaimEdge === undefined) throw new Error("ordos fixture: acclaim edge missing");
  return [
    { name: "negate-root", ivs: [negateEvent(ORDOS_IDS.events.oldWardenDies)] },
    { name: "force-established (provenance-only)", ivs: [forceEvent(ORDOS_IDS.events.oldWardenDies)] },
    { name: "idempotent-setfact", ivs: [setFact(ORDOS_IDS.objects.seal, "made_of", "silver")] },
    { name: "real-override", ivs: [setFact(ORDOS_IDS.objects.seal, "made_of", "gold")] },
    { name: "sever-load-bearing", ivs: [severEdge(ORDOS_IDS.edges.vaelaAcclaimedRequiresDeath)] },
    {
      name: "sever-readd-net-zero",
      ivs: [severEdge(ORDOS_IDS.edges.vaelaAcclaimedRequiresDeath), addEdge(acclaimEdge)],
    },
    { name: "sever-nonexistent (no-op)", ivs: [severEdge("edge/does-not-exist")] },
    { name: "refused-write", ivs: [setFact(ORDOS_IDS.objects.seal, "made_of", "type/ghost")] },
    {
      name: "force-negate (contradiction)",
      ivs: [forceEvent(ORDOS_IDS.events.vaelaInvested), negateEvent(ORDOS_IDS.events.vaelaInvested)],
    },
    {
      name: "precedes-cycle (temporal)",
      ivs: [
        addEdge({
          id: "edge/probe-rite-before-death",
          kind: "PRECEDES",
          from: ORDOS_IDS.events.riteBindingVaela,
          to: ORDOS_IDS.events.oldWardenDies,
        }),
      ],
    },
    { name: "negate-one-occurrence", ivs: [negateEvent(ORDOS_IDS.events.riteBindingVaela)] },
    {
      name: "force-both-rites (constraint)",
      ivs: [forceEvent(ORDOS_IDS.events.galenRecognised), forceEvent(ORDOS_IDS.events.riteBindingGalen)],
    },
  ];
}

const CASES = [
  { name: "verrin", canon: verrinCanon(), routes: verrinRoutes(verrinCanon()) },
  { name: "ordos", canon: ordosCanon(), routes: ordosRoutes(ordosCanon()) },
];

/* ------------------------------------------------------------------ */
/* INV — the central invariant, swept over every route                 */
/* ------------------------------------------------------------------ */

describe.each(CASES)("INV sweep [$name]", ({ canon, routes }) => {
  it("diff(A,B) empty ⟺ stateHash(A)===stateHash(B), for every route", () => {
    const A = derive(canon, []);
    for (const route of routes) {
      const B = derive(canon, route.ivs);
      const d = worldDiff(A, B);
      const eq = A.stateHash === B.stateHash;
      expect(
        diffEmpty(d),
        `route "${route.name}": diffEmpty=${diffEmpty(d)} but stateHashEqual=${eq}`
      ).toBe(eq);
    }
  });

  it("self-diff is the identity: every delta array empty", () => {
    const A = derive(canon, []);
    const d = worldDiff(A, A);
    expect(diffEmpty(d)).toBe(true);
  });

  it("D10: repeated diff generation is byte-identical", () => {
    const A = derive(canon, []);
    const route = routes[0];
    if (route === undefined) throw new Error("fixture: no routes");
    const B = derive(canon, route.ivs); // negate-root
    const d1 = worldDiff(A, B);
    const d2 = worldDiff(A, B);
    expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
    expect(d1.hash).toBe(d2.hash);
  });
});

/* ------------------------------------------------------------------ */
/* H2 — record churn is not semantic change                            */
/* ------------------------------------------------------------------ */

describe("H2: churn pairs produce an empty diff AND equal stateHash", () => {
  const v = verrinCanon();
  const oathEdge = v.edges.find((e) => e.id === "edge/kael-oath-requires-blight")!;

  it("verrin: idempotent setFact / force-of-ESTABLISHED / net-zero sever / double force / convergent setFact-vs-relocate", () => {
    const A = derive(v, []);
    const pairs: [WorldState, WorldState, string][] = [
      [A, derive(v, [setFact("char/kael", "sibling_of", "char/vara")]), "idempotent setFact"],
      [A, derive(v, [forceEvent("ev/blight-begins")]), "force of an ESTABLISHED event"],
      [A, derive(v, [severEdge("edge/kael-oath-requires-blight"), addEdge(oathEdge)]), "sever+re-add net zero"],
      [
        derive(v, [forceEvent("ev/blight-begins")]),
        derive(v, [forceEvent("ev/blight-begins"), forceEvent("ev/blight-begins")]),
        "double force vs single force",
      ],
      [
        derive(v, [setFact("char/vara", "located_in", "loc/thornhollow")]),
        derive(v, [relocate("char/vara", "loc/thornhollow")]),
        "setFact vs relocate writing the same cell",
      ],
    ];
    for (const [a, b, label] of pairs) {
      expect(diffEmpty(worldDiff(a, b)), `${label}: diff not empty`).toBe(true);
      expect(a.stateHash, `${label}: stateHash differs`).toBe(b.stateHash);
    }
  });

  it("ordos: idempotent setFact / force-of-ESTABLISHED / net-zero sever / double force", () => {
    const o = ordosCanon();
    const acclaimEdge = o.edges.find((e) => e.id === ORDOS_IDS.edges.vaelaAcclaimedRequiresDeath)!;
    const A = derive(o, []);
    const pairs: [WorldState, WorldState, string][] = [
      [A, derive(o, [setFact(ORDOS_IDS.objects.seal, "made_of", "silver")]), "idempotent setFact"],
      [A, derive(o, [forceEvent(ORDOS_IDS.events.oldWardenDies)]), "force of an ESTABLISHED event"],
      [
        A,
        derive(o, [severEdge(ORDOS_IDS.edges.vaelaAcclaimedRequiresDeath), addEdge(acclaimEdge)]),
        "sever+re-add net zero",
      ],
      [
        derive(o, [forceEvent(ORDOS_IDS.events.oldWardenDies)]),
        derive(o, [forceEvent(ORDOS_IDS.events.oldWardenDies), forceEvent(ORDOS_IDS.events.oldWardenDies)]),
        "double force vs single force",
      ],
    ];
    for (const [a, b, label] of pairs) {
      expect(diffEmpty(worldDiff(a, b)), `${label}: diff not empty`).toBe(true);
      expect(a.stateHash, `${label}: stateHash differs`).toBe(b.stateHash);
    }
  });
});

/* ------------------------------------------------------------------ */
/* H3 — effective state change must be observable (the cascade)        */
/* ------------------------------------------------------------------ */

describe.each([
  { name: "verrin", canon: verrinCanon(), root: "ev/blight-begins" },
  { name: "ordos", canon: ordosCanon(), root: ORDOS_IDS.events.oldWardenDies },
])("H3: cascade [$name]", ({ canon, root }) => {
  it("negating the root exposes every derived consequence, not just the write", () => {
    const A = derive(canon, []);
    const B = derive(canon, [negateEvent(root)]);
    const d = worldDiff(A, B);
    // downstream verdicts, not just the negated event
    expect(d.statusChanges.length).toBeGreaterThan(1);
    expect(d.statusChanges.some((s) => s.entityId === root && s.to === "EXCLUDED")).toBe(true);
    // work classifications moved
    expect(d.workStatusChanges.length).toBeGreaterThan(0);
    // reachability flipped
    expect(d.reachabilityChanges.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* H5 — constraint-only change has deterministic diff identity         */
/* ------------------------------------------------------------------ */

describe("H5: constraint deltas (the P-006 residual)", () => {
  it("ordos: forcing both rites surfaces the constraint violation in the diff", () => {
    const o = ordosCanon();
    const A = derive(o, []);
    const B = derive(o, [
      forceEvent(ORDOS_IDS.events.galenRecognised),
      forceEvent(ORDOS_IDS.events.riteBindingGalen),
    ]);
    const d = worldDiff(A, B);
    expect(d.constraintViolationsIntroduced.map((x) => x.typeId)).toContain(ORDOS_IDS.types.riteOfBinding);
    expect(d.constraintViolationsIntroduced.map((x) => x.typeId)).toContain(ORDOS_IDS.types.investiture);
    expect(d.constraintViolationsResolved).toEqual([]);
    // deterministic identity: the hash changes exactly because the delta did
    expect(d.hash).not.toBe(worldDiff(A, A).hash);
    expect(d.hash).toBe(worldDiff(A, B).hash);
  });

  it("the reverse direction reports the violations resolved", () => {
    const o = ordosCanon();
    const A = derive(o, []);
    const B = derive(o, [
      forceEvent(ORDOS_IDS.events.galenRecognised),
      forceEvent(ORDOS_IDS.events.riteBindingGalen),
    ]);
    const d = worldDiff(B, A);
    expect(d.constraintViolationsResolved.map((x) => x.typeId)).toContain(ORDOS_IDS.types.riteOfBinding);
    expect(d.constraintViolationsIntroduced).toEqual([]);
  });

  it("D5: observed=2 vs observed=3 are DIFFERENT diffs despite the same violation id", () => {
    // Toy canon: three root occurrences of one type, AT_MOST_ONE declared.
    const entities: Entity[] = [
      { id: "type/act", kind: "EventType", name: "Act" },
      { id: "ev/a1", kind: "Event", name: "A1" },
      { id: "ev/a2", kind: "Event", name: "A2" },
      { id: "ev/a3", kind: "Event", name: "A3" },
    ];
    const facts: Fact[] = [1, 2, 3].map((n) => ({
      id: `fact/a${n}-is-act`,
      subject: `ev/a${n}`,
      predicate: INSTANCE_OF,
      object: "type/act",
      validFrom: null,
      validTo: null,
      source: "canon",
    }));
    const body = {
      canonId: "canon/toy-cardinality",
      version: "0.0.1",
      entities,
      facts,
      edges: [] as CausalEdge[],
      workBindings: [],
      constraints: [{ id: "constraint/act-at-most-one", typeId: "type/act", bound: "AT_MOST_ONE" as const }],
    };
    const toy: Canon = { ...body, hash: hashCanon(body) };

    const w3 = derive(toy, []); // 3 occurrences -> violation observed=3
    const w2 = derive(toy, [negateEvent("ev/a3")]); // 2 occurrences -> violation observed=2
    const w1 = derive(toy, [negateEvent("ev/a2"), negateEvent("ev/a3")]); // 1 -> valid

    // same violation id, different content: BOTH sides of the delta fire
    const d32 = worldDiff(w3, w2);
    expect(d32.constraintViolationsIntroduced.map((x) => x.observed)).toEqual([2]);
    expect(d32.constraintViolationsResolved.map((x) => x.observed)).toEqual([3]);
    // different semantic deltas -> different diff identities
    expect(worldDiff(w3, w2).hash).not.toBe(worldDiff(w3, w1).hash);
    // INV on the toy canon: these are DIFFERENT worlds (2 vs 3 occurrences of
    // the constrained type), so the hashes differ and the diff must NOT be
    // empty. The invariant is an equivalence — diffEmpty ⟺ hashes EQUAL.
    expect(w3.stateHash).not.toBe(w2.stateHash);
    expect(diffEmpty(d32)).toBe(w3.stateHash === w2.stateHash);
    expect(diffEmpty(d32)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* D5 — id-vs-content on contradiction records                         */
/* ------------------------------------------------------------------ */

describe("D5: records are compared by content, not by id", () => {
  it("two refused writes with the same contradiction id but different phantom objects are a visible delta", () => {
    const v = verrinCanon();
    const wa = derive(v, [setFact("char/vara", "located_in", "type/ghost-a")]);
    const wb = derive(v, [setFact("char/vara", "located_in", "type/ghost-b")]);
    // both refused, one record each, SAME id, DIFFERENT content
    expect(wa.contradictions.map((c) => c.id)).toEqual(wb.contradictions.map((c) => c.id));
    const contraA = wa.contradictions[0];
    const contraB = wb.contradictions[0];
    if (contraA === undefined || contraB === undefined) throw new Error("fixture: refused writes must record one contradiction each");
    expect(contraA.detail).not.toBe(contraB.detail);
    const d = worldDiff(wa, wb);
    expect(d.contradictionsIntroduced.length).toBe(1);
    expect(d.contradictionsResolved.length).toBe(1);
    // and the worlds are semantically different, so INV demands a non-empty diff
    expect(wa.stateHash).not.toBe(wb.stateHash);
    expect(diffEmpty(d)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* H6 — diff direction matters                                         */
/* ------------------------------------------------------------------ */

describe("H6: diff(A,B) is a directed object, distinct from diff(B,A)", () => {
  // The root event is named per canon, exactly as the H3 cascade suite does.
  // An earlier version of this test guessed the root by substring-matching
  // entity ids, which is fixture construction by heuristic: it silently found
  // nothing on Ordos ("ev/old-warden-dies" matches neither "death" nor "Dies")
  // and the test failed on an undefined fixture rather than on the claim.
  it.each([
    { name: "verrin", canon: verrinCanon(), root: "ev/blight-begins" },
    { name: "ordos", canon: ordosCanon(), root: ORDOS_IDS.events.oldWardenDies },
  ])("$name: reversing the direction swaps entries and changes the hash", ({ canon, root }) => {
    const A = derive(canon, []);
    const B = derive(canon, [negateEvent(root)]);
    const fwd = worldDiff(A, B);
    const rev = worldDiff(B, A);
    expect(diffEmpty(fwd)).toBe(false); // the witness must be a real change
    expect(fwd.hash).not.toBe(rev.hash);
    // status entries are swapped, not equal
    for (const s of fwd.statusChanges) {
      expect(rev.statusChanges).toContainEqual({ entityId: s.entityId, from: s.to, to: s.from });
    }
    // fact additions mirror removals
    expect(fwd.factAdditions.map((f) => f.id).sort()).toEqual(rev.factRemovals.map((f) => f.id).sort());
    expect(fwd.factRemovals.map((f) => f.id).sort()).toEqual(rev.factAdditions.map((f) => f.id).sort());
  });
});

/* ------------------------------------------------------------------ */
/* H7 — diffs do NOT form a composition algebra                        */
/* ------------------------------------------------------------------ */

describe("H7: no composition guarantee (cancellation witness)", () => {
  it("sever then re-add: both legs non-empty, the composed A→C is empty", () => {
    const v = verrinCanon();
    const oathEdge = v.edges.find((e) => e.id === "edge/kael-oath-requires-blight")!;
    const A = derive(v, []);
    const B = derive(v, [severEdge("edge/kael-oath-requires-blight")]);
    const C = derive(v, [severEdge("edge/kael-oath-requires-blight"), addEdge(oathEdge)]);
    expect(worldDiff(A, B).edgeChanges.length).toBeGreaterThan(0);
    expect(worldDiff(B, C).edgeChanges.length).toBeGreaterThan(0);
    const ac = worldDiff(A, C);
    expect(diffEmpty(ac)).toBe(true);
    expect(ac.hash).toBe(worldDiff(A, A).hash); // the empty diff has one identity
  });

  it("a contradiction introduced at B and resolved at C appears in both legs but in neither direction of A→C", () => {
    const v = verrinCanon();
    const A = derive(v, []);
    const B = derive(v, [forceEvent("ev/exodus"), negateEvent("ev/exodus")]);
    const C = derive(v, [negateEvent("ev/exodus")]);
    expect(worldDiff(A, B).contradictionsIntroduced.length).toBeGreaterThan(0);
    expect(worldDiff(B, C).contradictionsResolved.length).toBeGreaterThan(0);
    const ac = worldDiff(A, C);
    expect(ac.contradictionsIntroduced).toEqual([]);
    expect(ac.contradictionsResolved).toEqual([]);
    // A→C is NOT empty (the negation itself is a semantic change) — the point
    // is that the CONTRADICTION dimension does not compose.
    expect(diffEmpty(ac)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* D2 — is the causal LAW part of effective world state?               */
/* ------------------------------------------------------------------ */

/**
 * The architectural claim P-007 makes, and the evidence for it.
 *
 * Two existing tests were invalidated by folding `edges` into stateHash
 * (src/derive/ordering.test.ts's convergence case, and the same-value ALTERED
 * assertion below). The brief's rule: establish executable evidence that the
 * old expectations are obsolete BEFORE updating them. This block is that
 * evidence, measured in experiments/p007/edge-probes.ts.
 *
 * The decisive argument is COUNTERFACTUAL, not philosophical. A "dormant" edge
 * — one whose presence changes no current verdict — still determines how the
 * world responds to the next intervention. If stateHash excluded it, two worlds
 * would be declared identical and then respond differently to the same
 * intervention, which is precisely what a world identity must never permit in a
 * counterfactual engine.
 */
describe.each([
  {
    name: "verrin",
    canon: verrinCanon(),
    // an edge whose consequence is currently dormant: both endpoints already
    // occur, so adding a REQUIRES between them changes nothing observable
    dormantEdge: { id: "edge/probe-ultimatum-requires-exodus", kind: "REQUIRES", from: "ev/exodus", to: "ev/ember-ultimatum" } as CausalEdge,
    dependent: "ev/ember-ultimatum",
    prerequisite: "ev/exodus",
    // an edge kind that is INERT in propagation (contributes to no verdict)
    inertEdgeId: "edge/blight-motivates-oath",
  },
  {
    name: "ordos",
    canon: ordosCanon(),
    dormantEdge: { id: "edge/probe-survey-requires-investiture", kind: "REQUIRES", from: ORDOS_IDS.events.vaelaInvested, to: ORDOS_IDS.events.sealSurvey } as CausalEdge,
    dependent: ORDOS_IDS.events.sealSurvey,
    prerequisite: ORDOS_IDS.events.vaelaInvested,
    // ordos declares no MOTIVATES; PRECEDES contributes nothing to any judgment
    inertEdgeId: ORDOS_IDS.edges.deathBeforeAcclaim,
  },
])("D2: the causal law is part of effective world state [$name]", ({ canon, dormantEdge, dependent, prerequisite, inertEdgeId }) => {
  it("an edge whose consequence is dormant changes NO verdict and NO fact", () => {
    const A = derive(canon, []);
    const B = derive(canon, [addEdge(dormantEdge)]);
    expect(B.statuses).toEqual(A.statuses);
    expect(B.facts).toEqual(A.facts);
    expect(B.workStatuses).toEqual(A.workStatuses);
    expect(B.statuses[dependent]).toBe("ESTABLISHED");
  });

  it("...yet it is counterfactually load-bearing: the same later intervention yields different worlds", () => {
    // THIS is why the causal law belongs to world identity. Excluding it would
    // make these two worlds "the same world" while they respond differently to
    // an identical intervention.
    const withEdge = derive(canon, [addEdge(dormantEdge), negateEvent(prerequisite)]);
    const withoutEdge = derive(canon, [negateEvent(prerequisite)]);
    expect(withEdge.statuses[dependent]).toBe("UNSUPPORTED");
    expect(withoutEdge.statuses[dependent]).toBe("ESTABLISHED");
    expect(withEdge.stateHash).not.toBe(withoutEdge.stateHash);
  });

  it("so a dormant-edge difference IS a stateHash difference, and the diff explains it as an edge change", () => {
    const A = derive(canon, []);
    const B = derive(canon, [addEdge(dormantEdge)]);
    expect(A.stateHash).not.toBe(B.stateHash);
    const d = worldDiff(A, B);
    expect(d.edgeChanges).toEqual([
      { edgeId: dormantEdge.id, added: true, kind: dormantEdge.kind, from: dormantEdge.from, to: dormantEdge.to },
    ]);
    // and NOTHING else — a pure causal-law change, fully explained
    expect(d.statusChanges).toEqual([]);
    expect(d.factAdditions).toEqual([]);
    expect(d.factRemovals).toEqual([]);
    expect(d.factOverrides).toEqual([]);
    expect(d.workStatusChanges).toEqual([]);
    expect(d.reachabilityChanges).toEqual([]);
    expect(diffEmpty(d)).toBe(false);
  });

  it("an edge kind that is INERT in propagation is still part of the law", () => {
    // MOTIVATES (verrin) contributes nothing to any judgment by design;
    // PRECEDES (ordos) never means "causes". Severing either changes no
    // verdict — but the authored causal/temporal structure of the world is
    // different, and the diff says exactly that.
    const A = derive(canon, []);
    const B = derive(canon, [severEdge(inertEdgeId)]);
    expect(B.statuses).toEqual(A.statuses);
    expect(B.facts).toEqual(A.facts);
    expect(A.stateHash).not.toBe(B.stateHash);
    const d = worldDiff(A, B);
    expect(d.edgeChanges.map((e) => [e.edgeId, e.added])).toEqual([[inertEdgeId, false]]);
    expect(d.statusChanges).toEqual([]);
  });

  it("the converse: same facts + same statuses + same edges + different history => SAME stateHash", () => {
    // Provenance must not leak into world identity. A no-op edge intervention
    // and a net-zero sever+re-add both leave the law untouched.
    const A = derive(canon, []);
    const edge = canon.edges[0];
    if (edge === undefined) throw new Error("fixture: canon has no edges");
    const noop = derive(canon, [severEdge("edge/does-not-exist")]);
    const netZero = derive(canon, [severEdge(edge.id), addEdge(edge)]);
    for (const [w, label] of [[noop, "no-op sever"], [netZero, "sever+re-add"]] as [WorldState, string][]) {
      expect(w.edges, label).toEqual(A.edges);
      expect(w.stateHash, label).toBe(A.stateHash);
      expect(w.identityHash, label).not.toBe(A.identityHash); // lineage differs
      expect(diffEmpty(worldDiff(A, w)), label).toBe(true);
    }
  });

  it("edge NOTE and key order are not semantic: re-adding with a different note is the same world", () => {
    const A = derive(canon, []);
    const edge = canon.edges.find((e) => e.note !== undefined) ?? canon.edges[0];
    if (edge === undefined) throw new Error("fixture: canon has no edges");
    const renoted = derive(canon, [
      severEdge(edge.id),
      addEdge({ id: edge.id, kind: edge.kind, from: edge.from, to: edge.to, note: "a different authorial note" }),
    ]);
    expect(renoted.stateHash).toBe(A.stateHash);
    expect(diffEmpty(worldDiff(A, renoted))).toBe(true);
  });

  it("a REJECTED edge intervention creates no edge and no world change", () => {
    // A malformed addEdge (missing from/to) is dropped by resolveEdges. It must
    // not manufacture an edge, and the world must be identical.
    const A = derive(canon, []);
    const malformed: Intervention = {
      id: "addEdge:probe-malformed",
      kind: "addEdge",
      target: "edge/probe-malformed",
      params: { edge: { id: "edge/probe-malformed", kind: "REQUIRES" } },
      label: "malformed addEdge",
    };
    const B = derive(canon, [malformed]);
    expect(B.edges).toEqual(A.edges);
    expect(B.stateHash).toBe(A.stateHash);
    expect(diffEmpty(worldDiff(A, B))).toBe(true);
  });

  it("a load-bearing edge change reports the direct law change AND the derived consequences, in distinct dimensions", () => {
    const A = derive(canon, []);
    // negate the prerequisite so the edge is live, then compare severing it
    const withLaw = derive(canon, [negateEvent(prerequisite), addEdge(dormantEdge)]);
    const withoutLaw = derive(canon, [negateEvent(prerequisite)]);
    const d = worldDiff(withoutLaw, withLaw);
    expect(d.edgeChanges.length).toBe(1); // the DIRECT change: the law
    expect(d.statusChanges.some((s) => s.entityId === dependent)).toBe(true); // DERIVED
    // the two are separable by dimension, not conflated
    expect(d.edgeChanges[0]?.edgeId).toBe(dormantEdge.id);
    expect(A.stateHash).not.toBe(withLaw.stateHash);
  });
});

/* ------------------------------------------------------------------ */
/* D4 — ALTERED is value-based                                         */
/* ------------------------------------------------------------------ */

describe("D4: ALTERED keys on the VALUE, not on the write", () => {
  // Toy canon: work/pivot's member event (ev/end) brings about the located_in
  // fact (validFrom anchor), so the Work depends on that fact.
  function alteredCanon(): Canon {
    const entities: Entity[] = [
      { id: "char/hero", kind: "Character", name: "Hero" },
      { id: "loc/home", kind: "Location", name: "Home" },
      { id: "loc/away", kind: "Location", name: "Away" },
      { id: "loc/moon", kind: "Location", name: "Moon" },
      { id: "ev/end", kind: "Event", name: "The Pivot" },
    ];
    const facts: Fact[] = [
      { id: "fact/hero-home", subject: "char/hero", predicate: "located_in", object: "loc/home", validFrom: null, validTo: "ev/end", source: "canon" },
      { id: "fact/hero-away", subject: "char/hero", predicate: "located_in", object: "loc/away", validFrom: "ev/end", validTo: null, source: "canon" },
    ];
    const body = {
      canonId: "canon/altered-unit",
      version: "0.0.1",
      entities,
      facts,
      edges: [] as CausalEdge[],
      workBindings: [{ workId: "work/pivot", events: ["ev/end"] }],
    };
    return { ...body, hash: hashCanon(body) };
  }

  it("an idempotent write on a work-dependent fact does NOT alter the work", () => {
    const c = alteredCanon();
    const A = derive(c, []);
    const idem = derive(c, [setFact("char/hero", "located_in", "loc/away")]); // canon's own value
    expect(idem.workStatuses["work/pivot"]).toBe("PRESERVED");
    const d = worldDiff(A, idem);
    expect(d.workStatusChanges).toEqual([]); // no ALTERED entry
    expect(diffEmpty(d)).toBe(true); // churn, not change
  });

  it("a genuinely different value DOES alter the work", () => {
    const c = alteredCanon();
    const A = derive(c, []);
    const real = derive(c, [setFact("char/hero", "located_in", "loc/moon")]);
    expect(real.workStatuses["work/pivot"]).toBe("ALTERED");
    const d = worldDiff(A, real);
    expect(d.workStatusChanges).toContainEqual({ workId: "work/pivot", from: "PRESERVED", to: "ALTERED" });
  });

  it("different histories reaching the same VALUE produce the same alteration verdict", () => {
    // Compare worlds, not writes: three writes ending on loc/moon and one
    // write to loc/moon are the same world, so the same ALTERED verdict and an
    // empty diff between them.
    const c = alteredCanon();
    const oneWrite = derive(c, [setFact("char/hero", "located_in", "loc/moon")]);
    const threeWrites = derive(c, [
      setFact("char/hero", "located_in", "loc/home"),
      setFact("char/hero", "located_in", "loc/away"),
      setFact("char/hero", "located_in", "loc/moon"),
    ]);
    expect(threeWrites.workStatuses["work/pivot"]).toBe("ALTERED");
    expect(oneWrite.workStatuses["work/pivot"]).toBe("ALTERED");
    expect(oneWrite.stateHash).toBe(threeWrites.stateHash);
    expect(diffEmpty(worldDiff(oneWrite, threeWrites))).toBe(true);
    expect(oneWrite.identityHash).not.toBe(threeWrites.identityHash); // lineage differs
  });

  it.each([
    { name: "verrin", canon: verrinCanon(), subject: "char/vara", predicate: "located_in" },
    { name: "ordos", canon: ordosCanon(), subject: ORDOS_IDS.objects.seal, predicate: "held_by" },
  ])(
    "$name: writing a work-dependent fact back to its own effective value never flips a Work to ALTERED (cross-canon)",
    ({ canon, subject, predicate }) => {
      // The SCOPED D4 claim, and the only one that holds on both canons: a
      // same-value write produces no fact-value change and therefore no
      // ALTERED. (The broader claim "the whole diff is empty" is FALSE on
      // Ordos — see the cell-refutation test below. An earlier draft of this
      // test asserted the broad version and was falsified by Ordos, which is
      // the ncr-004 pattern the NCR-005 sweep exists to catch.)
      const A = derive(canon, []);
      const current = A.facts.find((f) => f.subject === subject && f.predicate === predicate);
      if (current === undefined) throw new Error(`fixture: ${subject}.${predicate} not effective`);
      const B = derive(canon, [setFact(subject, predicate, current.object)]);
      const d = worldDiff(A, B);
      // the fact's own value is unchanged
      expect(d.factOverrides.filter((o) => o.factId === current.id)).toEqual([]);
      // and no Work anywhere flips to ALTERED
      expect(d.workStatusChanges.filter((w) => w.to === "ALTERED")).toEqual([]);
      // the effective fact still holds, with the same value
      expect(B.facts.find((f) => f.id === current.id)?.object).toBe(current.object);
    }
  );

  it("FINDING: a same-value write is a CELL assignment, so it can still be semantically visible", () => {
    // Ordos's (seal, held_by) cell holds four windowed canon facts. A setFact
    // on that cell does not merely assert "vaela holds the Seal" — it fixes the
    // cell, which REFUTES the rival canon facts in it (P-004 buildModel:
    // overriddenCells makes a rival fact node FALSE). fact/seal-held-galen is a
    // graph node gating Galen's rite, so refuting it moves real verdicts:
    // UNKNOWN -> UNSUPPORTED. That is a genuine world change, not record churn.
    //
    // The distinction P-007 must preserve: the fact's VALUE did not change (no
    // override, no ALTERED), but the world's MODAL structure did — what was
    // merely unknown is now impossible.
    const o = ordosCanon();
    const A = derive(o, []);
    const B = derive(o, [setFact(ORDOS_IDS.objects.seal, "held_by", ORDOS_IDS.characters.vaela)]);
    expect(A.statuses[ORDOS_IDS.facts.sealHeldGalen]).toBe("UNKNOWN");
    expect(B.statuses[ORDOS_IDS.facts.sealHeldGalen]).toBe("UNSUPPORTED");
    expect(A.statuses[ORDOS_IDS.events.riteBindingGalen]).toBe("UNKNOWN");
    expect(B.statuses[ORDOS_IDS.events.riteBindingGalen]).toBe("UNSUPPORTED");
    // so the worlds differ, and INV requires a non-empty diff
    expect(A.stateHash).not.toBe(B.stateHash);
    const d = worldDiff(A, B);
    expect(diffEmpty(d)).toBe(false);
    // and the diff explains it as status changes — not as a fact override
    expect(d.statusChanges.map((s) => s.entityId).sort()).toEqual(
      [ORDOS_IDS.facts.sealHeldGalen, ORDOS_IDS.events.riteBindingGalen].sort()
    );
    expect(d.factOverrides).toEqual([]);
  });

  it("Verrin's equivalent cell has no causally live rival, so there the same write IS invisible", () => {
    // The contrast that makes the finding precise: verrin's
    // (char/vara, located_in) cell also holds two windowed facts, but neither
    // is an edge endpoint, so refuting the rival changes no verdict.
    const v = verrinCanon();
    const A = derive(v, []);
    const current = A.facts.find((f) => f.subject === "char/vara" && f.predicate === "located_in");
    if (current === undefined) throw new Error("fixture: vara located_in not effective");
    const B = derive(v, [setFact("char/vara", "located_in", current.object)]);
    expect(A.stateHash).toBe(B.stateHash);
    expect(diffEmpty(worldDiff(A, B))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* D8 — occurrence identity                                             */
/* ------------------------------------------------------------------ */

describe.each([
  { name: "verrin", canon: verrinCanon(), negate: "ev/kael-oath", sibling: "ev/vara-vow" },
  { name: "ordos", canon: ordosCanon(), negate: ORDOS_IDS.events.riteBindingVaela, sibling: ORDOS_IDS.events.riteBindingGalen },
])("D8: occurrence substitution [$name]", ({ canon, negate, sibling }) => {
  it("negating ONE occurrence of the recurring type is visible; the sibling is untouched", () => {
    const A = derive(canon, []);
    const B = derive(canon, [negateEvent(negate)]);
    const d = worldDiff(A, B);
    expect(d.statusChanges.some((s) => s.entityId === negate)).toBe(true);
    expect(d.statusChanges.some((s) => s.entityId === sibling)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* D9 — INV is scoped same-canon                                       */
/* ------------------------------------------------------------------ */

describe("D9: the invariant's scope is same-canon", () => {
  it("cross-canon diffs are well-defined but INV is not claimed there", () => {
    const verrinBase = derive(verrinCanon(), []);
    const ordosBase = derive(ordosCanon(), []);
    const d = worldDiff(verrinBase, ordosBase);
    // Disjoint status key sets: every key of one world is UNKNOWN in the
    // other, so the diff is loudly non-empty...
    expect(d.statusChanges.length).toBeGreaterThan(0);
    // ...and the state hashes differ (different canons entirely).
    expect(verrinBase.stateHash).not.toBe(ordosBase.stateHash);
    // No universal is claimed about the ⟺ here; both directions merely hold
    // on this witness. The INV suite above is scoped per canon.
  });
});
