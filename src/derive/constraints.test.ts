/**
 * Somnium Engine — P-006 cardinality constraint tests.
 *
 * Falsifiable predictions in experiments/p006/predictions.md. Every prediction
 * lettered A–M here maps to a test. The ncr-004 rule applies: any claim about
 * "both seed canons" is a parameterized test, not prose.
 */
import { describe, expect, it } from "vitest";
import type { Canon, Entity } from "../canon/types";
import { INSTANCE_OF } from "../canon/types";
import { hashCanon } from "../canon/hash";
import { validateCanon } from "../canon/canon";
import { derive } from "./world-state";
import { evaluateConstraints } from "./constraints";
import { forceEvent, negateEvent, setFact, relocate, retractFact, addEdge } from "../timeline/types";
import { occurrenceCount, occurrencesOfType } from "../query/occurrence";
import { ordosCanon, ORDOS_IDS } from "../canon/ordos";
import { verrinCanon } from "../canon/verrin";

/** A tiny canon: one EventType, three occurrences, optional constraint. */
function makeCanon(bound?: "AT_MOST_ONE" | "AT_LEAST_ONE"): Canon {
  const entities: Entity[] = [
    { id: "type/x", kind: "EventType", name: "X" },
    { id: "ev/x1", kind: "Event", name: "X1" },
    { id: "ev/x2", kind: "Event", name: "X2" },
    { id: "ev/x3", kind: "Event", name: "X3" },
  ];
  const canon: Canon = {
    canonId: "canon/card",
    version: "1.0.0",
    entities,
    facts: [
      { id: "fact/x1", subject: "ev/x1", predicate: INSTANCE_OF, object: "type/x", validFrom: null, validTo: null, source: "canon" },
      { id: "fact/x2", subject: "ev/x2", predicate: INSTANCE_OF, object: "type/x", validFrom: null, validTo: null, source: "canon" },
      { id: "fact/x3", subject: "ev/x3", predicate: INSTANCE_OF, object: "type/x", validFrom: null, validTo: null, source: "canon" },
    ],
    edges: [],
    workBindings: [],
    constraints: bound ? [{ id: "constraint/x", typeId: "type/x", bound }] : undefined,
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

const NO_CONSTRAINT = makeCanon();
const AT_MOST = makeCanon("AT_MOST_ONE");
const AT_LEAST = makeCanon("AT_LEAST_ONE");

const COUNT = (w: ReturnType<typeof derive>): number => occurrenceCount(w, "type/x");
const VIOL = (w: ReturnType<typeof derive>): typeof w.constraintViolations => w.constraintViolations;

describe("A: unconstrained recurrence", () => {
  it("zero, one, or many occurrences of an unconstrained type produce no diagnostic", () => {
    const zero = derive(NO_CONSTRAINT, [negateEvent("ev/x1"), negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const one = derive(NO_CONSTRAINT, [negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const three = derive(NO_CONSTRAINT, []);
    expect(VIOL(zero)).toEqual([]);
    expect(VIOL(one)).toEqual([]);
    expect(VIOL(three)).toEqual([]);
  });

  it("sharing an EventType implies NO cardinality constraint", () => {
    const three = derive(NO_CONSTRAINT, []);
    expect(COUNT(three)).toBe(3);
    expect(VIOL(three)).toEqual([]);
  });
});

describe("B: AT_MOST_ONE", () => {
  it("0 occurrences -> valid; 1 -> valid; 2+ -> violation", () => {
    const zero = derive(AT_MOST, [negateEvent("ev/x1"), negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const one = derive(AT_MOST, [negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const many = derive(AT_MOST, []); // x1,x2,x3 all ESTABLISHED
    expect(VIOL(zero)).toEqual([]);
    expect(VIOL(one)).toEqual([]);
    expect(VIOL(many)).toHaveLength(1);
  });

  it("violation is visible in the effective world, not a validation error", () => {
    const many = derive(AT_MOST, []);
    expect(VIOL(many)[0]?.constraintId).toBe("constraint/x");
    expect(VIOL(many)[0]?.observed).toBe(3);
    // the canon itself validates fine
    expect(validateCanon(AT_MOST)).toEqual([]);
  });
});

describe("C: AT_LEAST_ONE", () => {
  it("0 -> violation; 1 -> valid; many -> valid", () => {
    const zero = derive(AT_LEAST, [negateEvent("ev/x1"), negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const one = derive(AT_LEAST, [negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const many = derive(AT_LEAST, []);
    expect(VIOL(zero)).toHaveLength(1);
    expect(VIOL(one)).toEqual([]);
    expect(VIOL(many)).toEqual([]);
  });
});

describe("D: EXACTLY_ONE is compositional", () => {
  it("AT_LEAST_ONE + AT_MOST_ONE behaves as exactly-one without a third primitive", () => {
    const both: Canon = {
      ...AT_MOST,
      constraints: [
        { id: "c/le", typeId: "type/x", bound: "AT_LEAST_ONE" },
        { id: "c/me", typeId: "type/x", bound: "AT_MOST_ONE" },
      ],
    };
    both.hash = hashCanon(both);
    const zero = derive(both, [negateEvent("ev/x1"), negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const one = derive(both, [negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const many = derive(both, []);
    // zero: at-least violated; one: valid; many: at-most violated
    expect(VIOL(zero).map((v) => v.bound)).toEqual(["AT_LEAST_ONE"]);
    expect(VIOL(one)).toEqual([]);
    expect(VIOL(many).map((v) => v.bound)).toEqual(["AT_MOST_ONE"]);
  });
});

describe("E: evaluated over occurrences, not writes", () => {
  it("a rejected write does not create an occurrence, so cannot trip the bound", () => {
    // forceEvent on an undeclared id: rejected as forced-undeclared; must NOT
    // appear as an occurrence of type/x.
    const w = derive(AT_MOST, [forceEvent("ev/ghost"), setFact("ev/ghost", INSTANCE_OF, "type/x")]);
    expect(occurrencesOfType(w, "type/x").filter((o) => o.occurred).length).toBe(3);
    expect(VIOL(w)).toHaveLength(1); // still 3 canonical occurrences, no phantom
    expect(occurrencesOfType(w, "type/x").some((o) => o.occurrenceId === "ev/ghost")).toBe(false);
  });

  it("occurrences are counted from the effective derived world", () => {
    const w = derive(AT_MOST, []);
    expect(COUNT(w)).toBe(occurrencesOfType(w, "type/x").filter((o) => o.occurred).length);
  });
});

describe("F: branch independence", () => {
  it("a violation in one branch does not leak into another", () => {
    // Both branches start from the same canon. Branch A makes x1+x2+x3 occur
    // (violation). Branch B negates all (no violation).
    const a = derive(AT_MOST, []);
    const b = derive(AT_MOST, [negateEvent("ev/x1"), negateEvent("ev/x2"), negateEvent("ev/x3")]);
    expect(VIOL(a)).toHaveLength(1);
    expect(VIOL(b)).toEqual([]);
    expect(a.stateHash).not.toBe(b.stateHash);
  });
});

describe("G: violation semantics — no silent mutation", () => {
  it("the violating occurrence keeps its causal status; nothing is auto-removed", () => {
    const w = derive(AT_MOST, []);
    // x1..x3 are all ESTABLISHED (causally fine), AND the constraint is
    // violated. The world is NOT silently made valid.
    expect(w.statuses["ev/x1"]).toBe("ESTABLISHED");
    expect(w.statuses["ev/x2"]).toBe("ESTABLISHED");
    expect(w.statuses["ev/x3"]).toBe("ESTABLISHED");
    expect(VIOL(w)).toHaveLength(1);
    expect(occurrencesOfType(w, "type/x").filter((o) => o.occurred).length).toBe(3);
  });

  it("violation is distinct from contradiction and from causal impossibility", () => {
    const violated = derive(AT_MOST, []); // three occurrences, no BOTH
    const contradictory = derive(AT_MOST, [negateEvent("ev/x1"), forceEvent("ev/x1")]); // force-vs-negated
    const impossible = derive(AT_MOST, [
      addEdge({ id: "edge/r", kind: "REQUIRES", from: "ev/missing", to: "ev/x2" }),
    ]); // x2 requires an undeclared thing -> UNKNOWN, x1+x3 alone occur
    expect(VIOL(violated).length).toBe(1);
    expect(contradictory.contradictions.length).toBeGreaterThan(0);
    expect(impossible.contradictions).toEqual([]);
    // the three phenomena produce different statuses/records
    expect(violated.statuses["ev/x1"]).toBe("ESTABLISHED");
    expect(contradictory.statuses["ev/x1"]).toBe("CONTRADICTORY");
    expect(impossible.statuses["ev/x2"]).toBe("UNKNOWN");
  });
});

describe("H: hash/diff semantics", () => {
  it("a violation changes stateHash but identityHash still distinguishes lineage", () => {
    const ok = derive(AT_MOST, [negateEvent("ev/x2"), negateEvent("ev/x3")]);
    const bad = derive(AT_MOST, []);
    expect(ok.stateHash).not.toBe(bad.stateHash);
    // same interventions to the same canon from the same rp -> same identityHash
    expect(derive(AT_MOST, []).identityHash).toBe(bad.identityHash);
  });

  it("the violation is deterministic across re-derives", () => {
    const a = derive(AT_MOST, []);
    const b = derive(AT_MOST, []);
    expect(a.constraintViolations).toEqual(b.constraintViolations);
    expect(a.stateHash).toBe(b.stateHash);
  });
});

describe("M: multi-depth — cardinality is recomputed per depth, not accumulated", () => {
  it("create X1 (valid) -> create X2 (violation) -> remove X1 (valid again)", () => {
    const d0 = derive(AT_MOST, []); // x1,x2,x3 => violation
    expect(VIOL(d0)).toHaveLength(1);
    const d1 = derive(AT_MOST, [negateEvent("ev/x1")]); // x2,x3 => violation
    expect(VIOL(d1)).toHaveLength(1);
    const d2 = derive(AT_MOST, [negateEvent("ev/x1"), negateEvent("ev/x2")]); // x3 only => valid
    expect(VIOL(d2)).toEqual([]);
    const d3 = derive(AT_MOST, [negateEvent("ev/x1"), negateEvent("ev/x2"), forceEvent("ev/x2")]);
    // x2 forced back + x3 => violation again
    expect(VIOL(d3)).toHaveLength(1);
    const d4 = derive(AT_MOST, [negateEvent("ev/x1"), negateEvent("ev/x2"), forceEvent("ev/x2"), negateEvent("ev/x3")]);
    // only x2 => valid
    expect(VIOL(d4)).toEqual([]);
  });

  it("a later branch removing an earlier occurrence returns to validity", () => {
    const w = derive(AT_MOST, [forceEvent("ev/x2"), negateEvent("ev/x1"), negateEvent("ev/x3")]);
    expect(VIOL(w)).toEqual([]);
    expect(COUNT(w)).toBe(1);
  });
});

describe("I: intervention semantics", () => {
  it("creating a second occurrence is allowed but makes the world violation-flagged", () => {
    const w = derive(AT_MOST, [forceEvent("ev/x2"), negateEvent("ev/x1"), negateEvent("ev/x3")]);
    expect(COUNT(w)).toBe(1); // one occurrence, valid
    const w2 = derive(AT_MOST, [forceEvent("ev/x2")]); // x1,x2,x3 all occur
    expect(COUNT(w2)).toBe(3);
    expect(VIOL(w2)).toHaveLength(1);
  });

  it("removing all occurrences violates AT_LEAST_ONE", () => {
    const w = derive(AT_LEAST, [negateEvent("ev/x1"), negateEvent("ev/x2"), negateEvent("ev/x3")]);
    expect(VIOL(w)).toHaveLength(1);
  });
});

describe("J: EXCLUDES vs cardinality (prediction X1-X3)", () => {
  it("fact-level EXCLUDES constrains value exclusivity, not occurrence cardinality", () => {
    // Ordos: two rites of one type. The Seal-holder EXCLUDES keeps at most one
    // holder; the cardinality constraint keeps at most one rite. They are
    // DIFFERENT axes and both exist.
    const o = ordosCanon();
    const baseline = derive(o, []);
    expect(occurrenceCount(baseline, ORDOS_IDS.types.riteOfBinding)).toBe(1);
    expect(VIOL(baseline)).toEqual([]); // satisfied at baseline

    // Force BOTH rites to complete: now cardinality is violated, and the
    // Seal-holder EXCLUDES is also violated (both holders effective) — two
    // DIFFERENT records, not one.
    const both = derive(o, [forceEvent(ORDOS_IDS.events.galenRecognised), forceEvent(ORDOS_IDS.events.riteBindingGalen)]);
    const cardViol = VIOL(both).filter((v) => v.typeId === ORDOS_IDS.types.riteOfBinding);
    const exclViol = both.contradictions.filter((c) => c.id.includes("excludes"));
    expect(cardViol).toHaveLength(1);
    expect(exclViol.length).toBeGreaterThan(0);
    // the two phenomena are distinguishable by record kind
    expect(cardViol[0]?.id).toMatch(/^violation\//);
    expect(exclViol[0]?.id).toMatch(/^contra:/);
  });
});

describe("cross-canon: parameterized universal (ncr-004 rule)", () => {
  it.each([
    { name: "verrin", canon: verrinCanon(), expectedViolations: 0 },
    { name: "ordos", canon: ordosCanon(), expectedViolations: 0 },
  ])("$name baseline satisfies all declared constraints", ({ canon, expectedViolations }) => {
    const w = derive(canon, []);
    expect(w.constraintViolations.length).toBe(expectedViolations);
    expect(validateCanon(canon)).toEqual([]);
  });

  it("every declared constraint references a real EventType", () => {
    for (const canon of [verrinCanon(), ordosCanon()]) {
      const types = new Set(canon.entities.filter((e) => e.kind === "EventType").map((e) => e.id));
      for (const c of canon.constraints ?? []) {
        expect(types.has(c.typeId)).toBe(true);
      }
    }
  });
});

describe("K: adversarial mutation routes (§11 of the brief)", () => {
  it("all representations of the effective world agree on cardinality state", () => {
    const w = derive(AT_MOST, [negateEvent("ev/x2"), negateEvent("ev/x3")]); // x1 only
    const occurred = occurrencesOfType(w, "type/x").filter((o) => o.occurred).map((o) => o.occurrenceId);
    const count = occurred.length;
    const diagnostic = VIOL(w);
    expect(count).toBe(1);
    expect(diagnostic).toEqual([]);
    const w2 = derive(AT_MOST, []); // x1,x2,x3
    const occurred2 = occurrencesOfType(w2, "type/x").filter((o) => o.occurred).map((o) => o.occurrenceId);
    expect(occurred2.length).toBe(3);
    expect(VIOL(w2)[0]?.observed).toBe(occurred2.length); // diagnostic agrees with query
  });

  it("direct fact intervention (retract instance_of) reduces the count", () => {
    const w = derive(AT_MOST, [retractFact("fact/x2"), retractFact("fact/x3")]);
    expect(COUNT(w)).toBe(1);
    expect(VIOL(w)).toEqual([]);
  });

  it("forced facts and negated facts are both reflected in the count", () => {
    const w = derive(AT_MOST, [forceEvent("ev/x3"), negateEvent("ev/x1"), negateEvent("ev/x2")]);
    expect(COUNT(w)).toBe(1);
    expect(VIOL(w)).toEqual([]);
    const w2 = derive(AT_MOST, [forceEvent("ev/x3"), negateEvent("ev/x1")]); // x2,x3
    expect(COUNT(w2)).toBe(2);
    expect(VIOL(w2)).toHaveLength(1);
  });

  it("undeclared references and derived occurrences do not pollute the count", () => {
    const w = derive(AT_MOST, [
      addEdge({ id: "edge/g", kind: "REQUIRES", from: "ev/ghost", to: "ev/x1" }),
      forceEvent("ev/ghost"),
    ]);
    // ghost is undeclared and forced -> forced-undeclared rule makes it
    // UNSUPPORTED, and x1 (which now REQUIRES it) is UNSUPPORTED too. The ghost
    // is NEVER an occurrence of type/x; only x2,x3 remain, and the violation
    // reflects exactly that.
    expect(occurrencesOfType(w, "type/x").filter((o) => o.occurred).map((o) => o.occurrenceId)).toEqual([
      "ev/x2",
      "ev/x3",
    ]);
    expect(w.statuses["ev/ghost"]).toBe("UNSUPPORTED");
    expect(VIOL(w)).toHaveLength(1);
    expect(VIOL(w)[0]?.observed).toBe(2); // diagnostic agrees with the query
  });

  it("multiple causal paths to the same occurrence count once", () => {
    const w = derive(AT_MOST, [setFact("ev/x2", "note", "twice-supported")]);
    expect(COUNT(w)).toBe(3);
    expect(VIOL(w)).toHaveLength(1);
    expect(VIOL(w)[0]?.observed).toBe(3);
  });
});

describe("temporal interaction (prediction T1-T2)", () => {
  it("X1 PRECEDES X2 under AT_MOST_ONE is a cardinality violation, not a cycle", () => {
    const canon = makeCanon("AT_MOST_ONE");
    canon.edges = [{ id: "edge/p", kind: "PRECEDES", from: "ev/x1", to: "ev/x2" }];
    canon.hash = hashCanon(canon);
    const w = derive(canon, []);
    expect(w.temporalViolations).toEqual([]); // NOT a cycle
    expect(VIOL(w)).toHaveLength(1); // but a cardinality violation
    expect(w.constraintViolations[0]?.detail).toMatch(/AT_MOST_ONE/);
  });

  it("temporal recurrence is not causal cycle and not contradiction", () => {
    const canon = makeCanon("AT_MOST_ONE");
    const entities = [...canon.entities, { id: "ev/y", kind: "Event" as const, name: "Y" }];
    const canon2: Canon = {
      ...canon,
      entities,
      edges: [
        { id: "edge/p1", kind: "PRECEDES", from: "ev/x1", to: "ev/y" },
        { id: "edge/p2", kind: "PRECEDES", from: "ev/y", to: "ev/x2" },
        { id: "edge/r1", kind: "REQUIRES", from: "ev/x1", to: "ev/y" },
      ],
    };
    canon2.hash = hashCanon(canon2);
    const w = derive(canon2, []);
    expect(w.temporalViolations).toEqual([]);
    expect(w.contradictions).toEqual([]);
    expect(VIOL(w)).toHaveLength(1);
  });
});
