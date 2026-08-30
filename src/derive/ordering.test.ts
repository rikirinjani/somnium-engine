/**
 * Somnium Engine — P-003: intervention ordering is part of the world's identity.
 *
 * Executable specification of the commutation result measured on the
 * adversarial canon (src/canon/verrin-adversarial.ts). The rule:
 *
 *   GRAPH-LEVEL interventions are SET-LIKE. negateEvent, forceEvent, severEdge
 *   and addEdge mark a node or edge idempotently (a set of negated targets, a
 *   map of forced targets, a set of present edges). Order never matters:
 *   derive(c, [X, Y]) and derive(c, [Y, X]) produce the same world.
 *
 *   FACT-LEVEL interventions are ASSIGNMENTS. setFact, retractFact and
 *   relocate write to the same (subject, predicate) cell, so the LAST write
 *   wins: derive(c, [set v1, set v2]) and derive(c, [set v2, set v1]) are
 *   GENUINELY DIFFERENT worlds.
 *
 * The content hash (WorldState.hash) is computed over the derived projection,
 * which already reflects the ACTUAL application order (facts are last-write-wins),
 * so it is identical for commuting orders and distinct for non-commuting ones.
 * P-001 hashed a SORTED intervention list, silently assuming commutativity that
 * does not hold; that assumption is gone.
 */
import { describe, expect, it } from "vitest";
import { ADV_IDS, verrinAdversarialCanon } from "../canon/verrin-adversarial";
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

describe("intervention ordering", () => {
  describe("graph-level interventions commute (set semantics)", () => {
    it("negateEvent(a) + negateEvent(b): identical world in either order", () => {
      const ab = derive(adv, [negateEvent(A.blight), negateEvent(A.exodus)]);
      const ba = derive(adv, [negateEvent(A.exodus), negateEvent(A.blight)]);
      expect(ab.statuses).toEqual(ba.statuses);
      expect(ab.facts).toEqual(ba.facts);
      expect(ab.hash).toBe(ba.hash);
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
      expect(ab.hash).toBe(ba.hash);
    });

    it("severEdge(e) + addEdge(e) with the same edge id: identical world in either order", () => {
      // [sever, add] leaves the edge present; [add, sever] leaves it absent —
      // but the exodus is a declared root either way, so the derived world is
      // bit-identical (statuses, facts, hash all agree).
      const edge = { id: EDGES.exodusRequiresBlight, kind: "REQUIRES" as const, from: A.blight, to: A.exodus };
      const ab = derive(adv, [severEdge(edge.id), addEdge(edge)]);
      const ba = derive(adv, [addEdge(edge), severEdge(edge.id)]);
      expect(ab.statuses[A.exodus]).toBe("ESTABLISHED");
      expect(ba.statuses[A.exodus]).toBe("ESTABLISHED");
      expect(ab.statuses).toEqual(ba.statuses);
      expect(ab.facts).toEqual(ba.facts);
      expect(ab.hash).toBe(ba.hash);
    });
  });

  describe("fact-level interventions do NOT commute (assignment semantics)", () => {
    it("setFact(s,p,v1) + setFact(s,p,v2): the last write wins", () => {
      const w1 = derive(adv, [setFact(vara, "located_in", valdar), setFact(vara, "located_in", thornhollow)]);
      const w2 = derive(adv, [setFact(vara, "located_in", thornhollow), setFact(vara, "located_in", valdar)]);
      expect(locatedIn(w1)).toBe(thornhollow); // thornhollow written last
      expect(locatedIn(w2)).toBe(valdar); // valdar written last
      expect(w1.facts).not.toEqual(w2.facts);
      expect(w1.hash).not.toBe(w2.hash);
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
      expect(w1.hash).not.toBe(w2.hash);
    });

    it("relocate(s,l1) + setFact(s,'located_in',l2): the last write wins", () => {
      const w1 = derive(adv, [relocate(vara, thornhollow), setFact(vara, "located_in", valdar)]);
      const w2 = derive(adv, [setFact(vara, "located_in", valdar), relocate(vara, thornhollow)]);
      expect(locatedIn(w1)).toBe(valdar); // setFact written last
      expect(locatedIn(w2)).toBe(thornhollow); // relocate written last
      expect(w1.facts).not.toEqual(w2.facts);
      expect(w1.hash).not.toBe(w2.hash);
    });
  });

  it("SUMMARY — graph-level interventions are sets; fact-level interventions are assignments (last write wins)", () => {
    // The two classes side by side: identical worlds hash identically,
    // genuinely different worlds never collide.
    const negAb = derive(adv, [negateEvent(A.blight), negateEvent(A.exodus)]);
    const negBa = derive(adv, [negateEvent(A.exodus), negateEvent(A.blight)]);
    expect(negAb.hash).toBe(negBa.hash); // same world (set semantics)

    const factAb = derive(adv, [setFact(vara, "located_in", valdar), setFact(vara, "located_in", thornhollow)]);
    const factBa = derive(adv, [setFact(vara, "located_in", thornhollow), setFact(vara, "located_in", valdar)]);
    expect(factAb.hash).not.toBe(factBa.hash); // different worlds (assignment semantics)
  });

  it("non-commutativity does not affect determinism: the same chain in the same order hashes identically", () => {
    const chain = [
      setFact(vara, "located_in", valdar),
      setFact(vara, "located_in", thornhollow),
      retractFact(FACTS.varaThornhollow),
    ];
    const a = derive(adv, chain);
    const b = derive(adv, chain);
    expect(a.hash).toBe(b.hash);
    expect(a.facts).toEqual(b.facts);
    expect(a.statuses).toEqual(b.statuses);
    expect(a.contradictions).toEqual(b.contradictions);
  });
});
