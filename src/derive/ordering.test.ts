/**
 * Somnium Engine — P-003: intervention ordering is part of the world's identity.
 *
 * Executable specification of the commutation result measured on the
 * adversarial canon (src/canon/verrin-adversarial.ts). The rule is a three-way
 * split, NOT the two-way "graph vs fact" split first written here:
 *
 *   SET-LIKE MARKS. negateEvent and forceEvent mark a node idempotently (a set
 *   of negated targets, a map of forced targets). Applying either twice equals
 *   applying it once, and order between them never matters:
 *   derive(c, [X, Y]) and derive(c, [Y, X]) produce the same world.
 *
 *   SEQUENTIAL EDGE-SET WRITES. severEdge and addEdge MUTATE the edge set in
 *   order (resolveEdges in propagation.ts): sever-then-add leaves the edge
 *   present, add-then-sever leaves it absent. On a canon where the edge is
 *   load-bearing those are DIFFERENT WORLDS. The first version of this file
 *   claimed they commuted, having tested them on an edge whose removal was
 *   invisible — see the regression test below.
 *
 *   ASSIGNMENTS. setFact, retractFact and relocate write to the same
 *   (subject, predicate) cell, so the LAST write wins:
 *   derive(c, [set v1, set v2]) and derive(c, [set v2, set v1]) are
 *   GENUINELY DIFFERENT worlds.
 *
 * The content hash folds the intervention list in under exactly that split
 * (canonicalInterventions in world-state.ts): set-like marks as a sorted
 * deduplicated set, every sequential kind in actual order. P-001 hashed a fully
 * sorted list, silently assuming commutativity that does not hold.
 */
import { describe, expect, it } from "vitest";
import { ADV_IDS, verrinAdversarialCanon } from "../canon/verrin-adversarial";
import type { Canon, CausalEdge, Entity } from "../canon/types";
import { hashCanon } from "../canon/hash";
import { derive } from "./world-state";
import {
  addEdge,
  forceEvent,
  negateEvent,
  relocate,
  retractFact,
  setFact,
  severEdge,
} from "../timeline/types";

const adv = verrinAdversarialCanon();
const A = ADV_IDS.A;
const FACTS = ADV_IDS.FACTS;
const EDGES = ADV_IDS.EDGES;

const vara = "char/adv-vara";
const valdar = "loc/adv-valdar";
const thornhollow = "loc/adv-thornhollow";

/** Vara's effective located_in object, or undefined when the fact is absent. */
function locatedIn(ws: ReturnType<typeof derive>): string | undefined {
  return ws.facts.find((f) => f.subject === vara && f.predicate === "located_in")?.object?.toString();
}

/**
 * Minimal canon where one REQUIRES edge is genuinely load-bearing:
 * `ev/q REQUIRES ev/p`. Negating `ev/p` refutes `ev/q` only while the edge is
 * present, so severing/adding that edge changes the outcome.
 */
function loadBearingCanon(): Canon {
  const entities: Entity[] = [
    { id: "ev/p", kind: "Event", name: "P" },
    { id: "ev/q", kind: "Event", name: "Q" },
  ];
  const edges: CausalEdge[] = [{ id: "edge/e", kind: "REQUIRES", from: "ev/p", to: "ev/q" }];
  const canon: Canon = {
    canonId: "canon/load-bearing",
    version: "1.0.0",
    entities,
    facts: [],
    edges,
    workBindings: [],
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

const LOAD_BEARING_EDGE: CausalEdge = { id: "edge/e", kind: "REQUIRES", from: "ev/p", to: "ev/q" };

describe("intervention ordering", () => {
  describe("set-like marks commute (negateEvent, forceEvent)", () => {
    it("negateEvent(a) + negateEvent(b): identical world in either order", () => {
      const ab = derive(adv, [negateEvent(A.blight), negateEvent(A.exodus)]);
      const ba = derive(adv, [negateEvent(A.exodus), negateEvent(A.blight)]);
      expect(ab.statuses).toEqual(ba.statuses);
      expect(ab.facts).toEqual(ba.facts);
      expect(ab.identityHash).toBe(ba.identityHash);
    });

    it("forceEvent(x) + negateEvent(x) on one node: identical world in either order", () => {
      const ab = derive(adv, [forceEvent(A.blight), negateEvent(A.blight)]);
      const ba = derive(adv, [negateEvent(A.blight), forceEvent(A.blight)]);
      // both orders produce the same forced-vs-negated contradiction at the node
      expect(ab.statuses[A.blight]).toBe("CONTRADICTORY");
      expect(ba.statuses[A.blight]).toBe("CONTRADICTORY");
      expect(ab.contradictions).toEqual(ba.contradictions);
      expect(ab.statuses).toEqual(ba.statuses);
      expect(ab.facts).toEqual(ba.facts);
      expect(ab.identityHash).toBe(ba.identityHash);
    });

    it("marks are idempotent: negating twice equals negating once", () => {
      const once = derive(adv, [negateEvent(A.blight)]);
      const twice = derive(adv, [negateEvent(A.blight), negateEvent(A.blight)]);
      expect(twice.identityHash).toBe(once.identityHash);
    });
  });

  describe("edge-set writes do NOT commute (severEdge, addEdge)", () => {
    it("REGRESSION: sever+add on a LOAD-BEARING edge yields different worlds", () => {
      // The original version of this suite asserted these commuted. They do not.
      // That test only passed because it targeted an edge whose removal was
      // invisible (its target was a declared root either way), so the two
      // genuinely different edge sets produced the same derived world.
      const canon = loadBearingCanon();
      const severAdd = derive(canon, [negateEvent("ev/p"), severEdge("edge/e"), addEdge(LOAD_BEARING_EDGE)]);
      const addSever = derive(canon, [negateEvent("ev/p"), addEdge(LOAD_BEARING_EDGE), severEdge("edge/e")]);

      // [sever, add] => edge present => q's prerequisite is the negated p
      expect(severAdd.statuses["ev/q"]).toBe("UNSUPPORTED");
      // [add, sever] => edge absent => q is a root
      expect(addSever.statuses["ev/q"]).toBe("ESTABLISHED");
      expect(severAdd.identityHash).not.toBe(addSever.identityHash);
    });

    it("two chains reaching the same VERDICTS under different causal laws are different worlds (P-007)", () => {
      // P-004 (docs §18.4) wrote this as the CONVERGENCE case: on the
      // adversarial canon the edge is not load-bearing, so [sever, add] and
      // [add, sever] derive the same statuses and facts, and pre-P-007 that was
      // enough to call them the same WORLD (same stateHash, different
      // identityHash).
      //
      // P-007 CHANGED THAT DEFINITION, deliberately. The effective edge set is
      // part of a world's meaning: [sever, add] leaves the edge PRESENT (exodus
      // happens BECAUSE of the blight) and [add, sever] leaves it ABSENT (exodus
      // is uncaused). Those are different fictional worlds even though every
      // verdict coincides — measured as probe P6 in experiments/p007/probes.ts
      // and predicted as D2 in experiments/p007/predictions.md. Folding `edges`
      // into stateHash is what makes the P-007 invariant hold:
      //   worldDiff(A, B) empty ⟺ stateHash(A) === stateHash(B).
      // Under the old definition this pair had one stateHash and a NON-EMPTY
      // semantic diff (edgeChanges), which is exactly the failure P-007 exists
      // to remove.
      //
      // The derived CONTENT still coincides, so this remains the sharpest
      // available statement of "the verdicts agree but the worlds do not".
      const edge: CausalEdge = { id: EDGES.exodusRequiresBlight, kind: "REQUIRES", from: A.blight, to: A.exodus };
      const severAdd = derive(adv, [severEdge(edge.id), addEdge(edge)]);
      const addSever = derive(adv, [addEdge(edge), severEdge(edge.id)]);

      expect(severAdd.statuses).toEqual(addSever.statuses); // same verdicts
      expect(severAdd.facts).toEqual(addSever.facts); // same effective facts
      // ...but not the same causal law:
      expect(severAdd.edges.some((e) => e.id === edge.id)).toBe(true);
      expect(addSever.edges.some((e) => e.id === edge.id)).toBe(false);
      expect(severAdd.stateHash).not.toBe(addSever.stateHash); // DIFFERENT world (P-007)
      expect(severAdd.identityHash).not.toBe(addSever.identityHash); // and reached differently
      expect(severAdd.interventions.map((i) => i.kind)).not.toEqual(addSever.interventions.map((i) => i.kind));
    });

    it("P-004's convergence invariant still holds, on a pair that genuinely converges", () => {
      // The invariant the case above used to carry — same effective world
      // reached by different chains => same stateHash, different identityHash —
      // is still load-bearing (a memo keyed on stateHash alone could hand back
      // someone else's provenance). It needs a pair that converges under the
      // P-007 definition: two chains that write the same cell to the same value
      // and leave the edge set untouched.
      const direct = derive(adv, [setFact(vara, "located_in", thornhollow)]);
      const viaRelocate = derive(adv, [relocate(vara, thornhollow)]);

      expect(direct.statuses).toEqual(viaRelocate.statuses);
      expect(direct.facts).toEqual(viaRelocate.facts);
      expect(direct.edges).toEqual(viaRelocate.edges);
      expect(direct.stateHash).toBe(viaRelocate.stateHash); // same WORLD
      expect(direct.identityHash).not.toBe(viaRelocate.identityHash); // reached differently
    });
  });

  describe("assignments do NOT commute (setFact, relocate, retractFact)", () => {
    it("setFact(s,p,v1) + setFact(s,p,v2): the last write wins", () => {
      const w1 = derive(adv, [setFact(vara, "located_in", valdar), setFact(vara, "located_in", thornhollow)]);
      const w2 = derive(adv, [setFact(vara, "located_in", thornhollow), setFact(vara, "located_in", valdar)]);
      expect(locatedIn(w1)).toBe(thornhollow); // thornhollow written last
      expect(locatedIn(w2)).toBe(valdar); // valdar written last
      expect(w1.facts).not.toEqual(w2.facts);
      expect(w1.identityHash).not.toBe(w2.identityHash);
    });

    it("setFact(s,p,v) + retractFact(f): the retract hits a different fact by order", () => {
      // order 1: the set overrides thornhollow's fact (inheriting its id), and
      // the retract then removes that id => NO located_in fact survives.
      const w1 = derive(adv, [setFact(vara, "located_in", valdar), retractFact(FACTS.varaThornhollow)]);
      // order 2: the retract removes thornhollow's fact first, then the set
      // creates a fresh derived fact => valdar survives under a synthetic id.
      const w2 = derive(adv, [retractFact(FACTS.varaThornhollow), setFact(vara, "located_in", valdar)]);
      expect(locatedIn(w1)).toBeUndefined();
      expect(locatedIn(w2)).toBe(valdar);
      expect(w1.facts).not.toEqual(w2.facts);
      expect(w1.identityHash).not.toBe(w2.identityHash);
    });

    it("relocate(s,l1) + setFact(s,'located_in',l2): the last write wins", () => {
      const w1 = derive(adv, [relocate(vara, thornhollow), setFact(vara, "located_in", valdar)]);
      const w2 = derive(adv, [setFact(vara, "located_in", valdar), relocate(vara, thornhollow)]);
      expect(locatedIn(w1)).toBe(valdar); // setFact written last
      expect(locatedIn(w2)).toBe(thornhollow); // relocate written last
      expect(w1.facts).not.toEqual(w2.facts);
      expect(w1.identityHash).not.toBe(w2.identityHash);
    });
  });

  it("SUMMARY — three classes: set-like marks, edge-set writes, cell assignments", () => {
    // Identical worlds hash identically; genuinely different worlds never collide.
    const negAb = derive(adv, [negateEvent(A.blight), negateEvent(A.exodus)]);
    const negBa = derive(adv, [negateEvent(A.exodus), negateEvent(A.blight)]);
    expect(negAb.identityHash).toBe(negBa.identityHash); // set-like marks: one identity

    const canon = loadBearingCanon();
    const severAdd = derive(canon, [negateEvent("ev/p"), severEdge("edge/e"), addEdge(LOAD_BEARING_EDGE)]);
    const addSever = derive(canon, [negateEvent("ev/p"), addEdge(LOAD_BEARING_EDGE), severEdge("edge/e")]);
    expect(severAdd.identityHash).not.toBe(addSever.identityHash); // edge-set writes: sequential

    const factAb = derive(adv, [setFact(vara, "located_in", valdar), setFact(vara, "located_in", thornhollow)]);
    const factBa = derive(adv, [setFact(vara, "located_in", thornhollow), setFact(vara, "located_in", valdar)]);
    expect(factAb.identityHash).not.toBe(factBa.identityHash); // cell assignments: last write wins
  });

  it("non-commutativity does not affect determinism: the same chain in the same order hashes identically", () => {
    const chain = [
      setFact(vara, "located_in", valdar),
      setFact(vara, "located_in", thornhollow),
      retractFact(FACTS.varaThornhollow),
    ];
    const a = derive(adv, chain);
    const b = derive(adv, chain);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.facts).toEqual(b.facts);
    expect(a.statuses).toEqual(b.statuses);
    expect(a.contradictions).toEqual(b.contradictions);
  });
});
