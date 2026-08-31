/**
 * Somnium Engine — occurrence/type unit tests (P-005).
 *
 * These pin the occurrence-identity model:
 *   - an Event is an OCCURRENCE; an EventType is the KIND of one
 *   - identity is DECLARATIONAL — two occurrences with identical observable
 *     properties are still distinct
 *   - the type layer is ordinary facts, so it is intervenable and invisible to
 *     the causal engine
 */
import { describe, expect, it } from "vitest";
import type { Canon, CausalEdge, Entity, Fact } from "../canon/types";
import { INSTANCE_OF } from "../canon/types";
import { hashCanon } from "../canon/hash";
import { inspectCanon } from "../canon/canon";
import { derive } from "../derive/world-state";
import { addEdge, forceEvent, negateEvent, retractFact, setFact } from "../timeline/types";
import {
  declaredEventTypes,
  diffOccurrences,
  occurrenceCount,
  occurrencesOfType,
  typeOfOccurrence,
} from "./occurrence";

function mk(entities: Entity[], facts: Fact[], edges: CausalEdge[], id = "canon/occ"): Canon {
  const canon: Canon = {
    canonId: id,
    version: "1.0.0",
    entities,
    facts,
    edges,
    workBindings: [],
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

const instanceOf = (id: string, occurrence: string, type: string): Fact => ({
  id,
  subject: occurrence,
  predicate: INSTANCE_OF,
  object: type,
  validFrom: null,
  validTo: null,
  source: "canon",
});

/**
 * Twin occurrences: same type, same performer, same place, no distinguishing
 * fact. The whole point of the identity model.
 */
function twinCanon(): Canon {
  return mk(
    [
      { id: "char/vara", kind: "Character", name: "Vara" },
      { id: "loc/hall", kind: "Location", name: "The Hall" },
      { id: "type/rite", kind: "EventType", name: "The Rite" },
      { id: "ev/rite-1", kind: "Event", name: "The Rite" },
      { id: "ev/rite-2", kind: "Event", name: "The Rite" },
    ],
    [
      instanceOf("fact/t1", "ev/rite-1", "type/rite"),
      instanceOf("fact/t2", "ev/rite-2", "type/rite"),
      { id: "fact/a1", subject: "ev/rite-1", predicate: "performed_by", object: "char/vara", validFrom: null, validTo: null, source: "canon" },
      { id: "fact/a2", subject: "ev/rite-2", predicate: "performed_by", object: "char/vara", validFrom: null, validTo: null, source: "canon" },
      { id: "fact/p1", subject: "ev/rite-1", predicate: "occurs_at", object: "loc/hall", validFrom: null, validTo: null, source: "canon" },
      { id: "fact/p2", subject: "ev/rite-2", predicate: "occurs_at", object: "loc/hall", validFrom: null, validTo: null, source: "canon" },
    ],
    [{ id: "edge/order", kind: "PRECEDES", from: "ev/rite-1", to: "ev/rite-2" }],
    "canon/twin"
  );
}

describe("occurrence identity is declarational", () => {
  it("distinguishes two occurrences with IDENTICAL observable properties", () => {
    // The mission's question: can two distinct occurrences have identical
    // observable properties? Yes — and the engine must still tell them apart.
    const canon = twinCanon();
    const n1 = derive(canon, [negateEvent("ev/rite-1")]);
    const n2 = derive(canon, [negateEvent("ev/rite-2")]);

    expect(n1.stateHash).not.toBe(n2.stateHash);
    expect(n1.statuses["ev/rite-1"]).toBe("EXCLUDED");
    expect(n1.statuses["ev/rite-2"]).toBe("ESTABLISHED");
    expect(n2.statuses["ev/rite-1"]).toBe("ESTABLISHED");
    expect(n2.statuses["ev/rite-2"]).toBe("EXCLUDED");
  });

  it("does not derive identity from type, participants, or location", () => {
    // Every attribute is shared; only the declared id differs.
    const canon = twinCanon();
    const world = derive(canon, []);
    const occ = occurrencesOfType(world, "type/rite");
    expect(occ.map((o) => o.occurrenceId)).toEqual(["ev/rite-1", "ev/rite-2"]);
    expect(new Set(occ.map((o) => o.typeId)).size).toBe(1); // same type
    expect(occ.every((o) => o.occurred)).toBe(true);
  });
});

describe("EventType is not a causal node", () => {
  it("gives a type no status at all", () => {
    const world = derive(twinCanon(), []);
    // A type does not occur, so it can neither ground nor refute anything.
    expect(world.statuses["type/rite"]).toBeUndefined();
    expect(world.judgments["type/rite"]).toBeUndefined();
  });

  it("validates a canon declaring EventType entities", () => {
    expect(inspectCanon(twinCanon()).errors).toEqual([]);
  });
});

describe("the type layer is ordinary facts", () => {
  it("is intervenable: retracting instance_of unlinks the occurrence from its type", () => {
    const canon = twinCanon();
    const untyped = derive(canon, [retractFact("fact/t1")]);
    expect(occurrencesOfType(untyped, "type/rite").map((o) => o.occurrenceId)).toEqual(["ev/rite-2"]);
    // ...and yet the occurrence still happened. Type membership and occurrence
    // are independent claims.
    expect(untyped.statuses["ev/rite-1"]).toBe("ESTABLISHED");
  });

  it("resolves an occurrence's type, or undefined when untyped", () => {
    const world = derive(twinCanon(), []);
    expect(typeOfOccurrence(world, "ev/rite-1")).toBe("type/rite");
    expect(typeOfOccurrence(world, "char/vara")).toBeUndefined();
  });

  it("lists declared types deterministically", () => {
    expect(declaredEventTypes(twinCanon())).toEqual(["type/rite"]);
  });
});

describe("temporal recurrence is not a causal cycle", () => {
  /**
   * The mission's pattern: A1 -> B1 -> A2 -> B2, where A1/A2 share a type and
   * B1/B2 share a type. Because Events are occurrences, this is a path of
   * length 4 through 4 distinct nodes — not a cycle.
   */
  function recurringCanon(): Canon {
    return mk(
      [
        { id: "type/rite", kind: "EventType", name: "Rite" },
        { id: "type/feast", kind: "EventType", name: "Feast" },
        { id: "ev/a1", kind: "Event", name: "Rite I" },
        { id: "ev/b1", kind: "Event", name: "Feast I" },
        { id: "ev/a2", kind: "Event", name: "Rite II" },
        { id: "ev/b2", kind: "Event", name: "Feast II" },
      ],
      [
        instanceOf("fact/a1t", "ev/a1", "type/rite"),
        instanceOf("fact/a2t", "ev/a2", "type/rite"),
        instanceOf("fact/b1t", "ev/b1", "type/feast"),
        instanceOf("fact/b2t", "ev/b2", "type/feast"),
      ],
      [
        { id: "edge/p1", kind: "PRECEDES", from: "ev/a1", to: "ev/b1" },
        { id: "edge/p2", kind: "PRECEDES", from: "ev/b1", to: "ev/a2" },
        { id: "edge/p3", kind: "PRECEDES", from: "ev/a2", to: "ev/b2" },
        // case F: the later occurrence of a type requires the earlier one
        { id: "edge/r1", kind: "REQUIRES", from: "ev/a1", to: "ev/a2" },
      ],
      "canon/recur"
    );
  }

  it("derives cleanly with no temporal violation and no cycle notice", () => {
    const canon = recurringCanon();
    const inspected = inspectCanon(canon);
    expect(inspected.errors).toEqual([]);
    // Crucially: NOT reported as a REQUIRES or PRECEDES cycle. Revisiting a
    // TYPE is not revisiting a NODE.
    expect(inspected.notices.filter((n) => /cycle/.test(n))).toEqual([]);

    const world = derive(canon, []);
    expect(world.temporalViolations).toEqual([]);
    expect(occurrenceCount(world, "type/rite")).toBe(2);
    expect(occurrenceCount(world, "type/feast")).toBe(2);
  });

  it("case F: negating the first occurrence refutes the later one that required it", () => {
    const world = derive(recurringCanon(), [negateEvent("ev/a1")]);
    expect(world.statuses["ev/a1"]).toBe("EXCLUDED");
    expect(world.statuses["ev/a2"]).toBe("UNSUPPORTED");
    expect(occurrenceCount(world, "type/rite")).toBe(0);
  });

  it("mere ordering does not propagate: a PRECEDES-only successor survives", () => {
    const world = derive(recurringCanon(), [negateEvent("ev/a1")]);
    // b1 and b2 only follow in time; nothing supports them from a1.
    expect(world.statuses["ev/b1"]).toBe("ESTABLISHED");
    expect(world.statuses["ev/b2"]).toBe("ESTABLISHED");
  });

  it("a genuine PRECEDES cycle on the SAME occurrence is still reported", () => {
    // An occurrence before itself: a real contradiction, distinct from recurrence.
    const canon = mk(
      [
        { id: "ev/x", kind: "Event", name: "X" },
        { id: "ev/y", kind: "Event", name: "Y" },
      ],
      [],
      [
        { id: "edge/c1", kind: "PRECEDES", from: "ev/x", to: "ev/y" },
        { id: "edge/c2", kind: "PRECEDES", from: "ev/y", to: "ev/x" },
      ],
      "canon/cycle"
    );
    expect(inspectCanon(canon).notices.some((n) => /PRECEDES cycle/.test(n))).toBe(true);
    expect(derive(canon, []).temporalViolations.length).toBe(1);
  });
});

describe("an intervention may never manufacture an occurrence", () => {
  const canon = mk(
    [
      { id: "ev/real", kind: "Event", name: "Real" },
      { id: "type/t", kind: "EventType", name: "T" },
    ],
    [],
    []
  );

  it("forcing an UNDECLARED occurrence is a contradiction, not a new event", () => {
    // P-005 DEFECT FIX (1 of 2). Before this, forceEvent on an id canon never
    // declared returned ESTABLISHED with support HARD and zero contradictions.
    const world = derive(canon, [forceEvent("ev/ghost")]);
    expect(world.statuses["ev/ghost"]).toBe("CONTRADICTORY");
    const record = world.contradictions.find((r) => r.id === "contra:ev/ghost:force-undeclared");
    expect(record).toBeDefined();
    expect(record?.source).toBe("forceEvent:ev/ghost");
    expect(record?.detail).toMatch(/never declares it/);
  });

  it("forcing a DECLARED occurrence remains ordinary", () => {
    const world = derive(canon, [forceEvent("ev/real")]);
    expect(world.statuses["ev/real"]).toBe("ESTABLISHED");
    expect(world.contradictions).toEqual([]);
  });

  it("negating an undeclared id stays harmless — removing a non-thing", () => {
    const world = derive(canon, [negateEvent("ev/ghost")]);
    expect(world.statuses["ev/ghost"]).toBe("EXCLUDED");
    expect(world.contradictions).toEqual([]);
  });

  /**
   * P-005 DEFECT FIX (2 of 2), found by the L2 gate after the first fix shipped.
   *
   * `addEdge` names arbitrary endpoints, so it could introduce an undeclared id
   * WITH support rules. The `declared` gate lived only in `hardSupport`'s
   * no-support-rules branch, so such a node fell through to `disjoin` and
   * inherited its prerequisite's truth:
   *
   *     addEdge({ REQUIRES, from: ev/real, to: ev/ghost })
   *       -> ev/ghost ESTABLISHED, support HARD, 0 contradictions
   *
   * The first fix gated `forceEvent` and the prose then claimed "every other
   * route already respected that gate" — which was false in the target
   * direction. These tests exist because a universal claim ("none possible")
   * shipped with no adversarial test behind it.
   */
  describe("every route to an undeclared id, adversarially", () => {
    it("addEdge with an undeclared TARGET does not promote it", () => {
      const world = derive(canon, [
        addEdge({ id: "edge/g", kind: "REQUIRES", from: "ev/real", to: "ev/ghost" }),
      ]);
      expect(world.statuses["ev/ghost"]).toBe("UNKNOWN");
      expect(world.judgments["ev/ghost"]).toMatchObject({ truth: "NEITHER", support: "NONE" });
    });

    it("addEdge with an undeclared SOURCE keeps dependents UNKNOWN (case K, unchanged)", () => {
      const world = derive(canon, [
        addEdge({ id: "edge/s", kind: "REQUIRES", from: "ev/ghost-src", to: "ev/real" }),
      ]);
      expect(world.statuses["ev/ghost-src"]).toBe("UNKNOWN");
      expect(world.statuses["ev/real"]).toBe("UNKNOWN");
    });

    it("a CHAIN of added edges cannot manufacture a history", () => {
      // The infinite-fictional-history case: before the fix this produced three
      // ESTABLISHED invented occurrences and no contradiction.
      const world = derive(canon, [
        addEdge({ id: "edge/1", kind: "REQUIRES", from: "ev/real", to: "ev/ga" }),
        addEdge({ id: "edge/2", kind: "REQUIRES", from: "ev/ga", to: "ev/gb" }),
        addEdge({ id: "edge/3", kind: "REQUIRES", from: "ev/gb", to: "ev/gc" }),
      ]);
      for (const ghost of ["ev/ga", "ev/gb", "ev/gc"]) {
        expect(world.statuses[ghost]).toBe("UNKNOWN");
      }
    });

    it("an ENABLES edge cannot promote an undeclared target either", () => {
      const world = derive(canon, [
        addEdge({ id: "edge/e", kind: "ENABLES", from: "ev/real", to: "ev/ghost" }),
      ]);
      expect(world.statuses["ev/ghost"]).toBe("UNKNOWN");
    });

    it("an invented id can never join a type or be counted", () => {
      // The occurrence layer must not be reachable by fabrication.
      const world = derive(canon, [
        addEdge({ id: "edge/g", kind: "REQUIRES", from: "ev/real", to: "ev/ghost" }),
        setFact("ev/ghost", "instance_of", "type/t"),
      ]);
      expect(occurrenceCount(world, "type/t")).toBe(0);
      expect(occurrencesOfType(world, "type/t").filter((o) => o.occurred)).toEqual([]);
    });

    it("declared roots and declared chains are unaffected by the gate", () => {
      // The gate must not over-fire: a declared node with no prerequisites is
      // still a root, and a declared dependent still inherits.
      const twoNode = mk(
        [
          { id: "ev/a", kind: "Event", name: "A" },
          { id: "ev/b", kind: "Event", name: "B" },
        ],
        [],
        [{ id: "edge/ab", kind: "REQUIRES", from: "ev/a", to: "ev/b" }],
        "canon/declared"
      );
      const world = derive(twoNode, []);
      expect(world.statuses["ev/a"]).toBe("ESTABLISHED");
      expect(world.statuses["ev/b"]).toBe("ESTABLISHED");
    });
  });

  it("the occurrence set never grows beyond what canon declares plus named targets", () => {
    const baseline = derive(canon, []);
    expect(Object.keys(baseline.statuses)).toEqual(["ev/real"]);
  });
});

describe("occurrence-set diff", () => {
  it("reports added, removed and retained occurrences of a type", () => {
    const canon = twinCanon();
    const baseline = derive(canon, []);
    const branch = derive(canon, [negateEvent("ev/rite-1")]);
    const d = diffOccurrences(baseline, branch, "type/rite");

    expect(d.typeId).toBe("type/rite");
    expect(d.removed).toEqual(["ev/rite-1"]);
    expect(d.retained).toEqual(["ev/rite-2"]);
    expect(d.added).toEqual([]);
  });

  it("distinguishes a lost sibling from a substitution", () => {
    // The mission asks for "event type remains but occurrence identity changes".
    // A single boolean could not carry it: the two seed canons pull in opposite
    // directions, so the diff reports THREE predicates.
    //
    // Here the twins are INDEPENDENT — removing rite-1 leaves rite-2 standing.
    // The occurrence SET changed, but nothing was substituted for what was lost.
    const canon = twinCanon();
    const baseline = derive(canon, []);
    const branch = derive(canon, [negateEvent("ev/rite-1")]);
    const d = diffOccurrences(baseline, branch, "type/rite");

    expect(d.setChanged).toBe(true); // the set is not the same
    expect(d.substituted).toBe(false); // but nothing replaced rite-1
    expect(d.typeCeased).toBe(false); // and the kind still happens
    expect(occurrenceCount(baseline, "type/rite")).toBe(2);
    expect(occurrenceCount(branch, "type/rite")).toBe(1);
  });

  it("flags substituted when a DIFFERENT occurrence carries the type", () => {
    // Competing alternatives: negate one twin and force the other into a world
    // where it would not otherwise stand. Both added AND removed => substitution.
    const canon = mk(
      [
        { id: "type/rite", kind: "EventType", name: "Rite" },
        { id: "ev/spark", kind: "Event", name: "The Spark" },
        { id: "ev/rite-a", kind: "Event", name: "Rite A" },
        { id: "ev/rite-b", kind: "Event", name: "Rite B" },
      ],
      [instanceOf("fact/a", "ev/rite-a", "type/rite"), instanceOf("fact/b", "ev/rite-b", "type/rite")],
      [
        // A stands on the spark; B has no support at all, so only A occurs.
        { id: "edge/sa", kind: "REQUIRES", from: "ev/spark", to: "ev/rite-a" },
        { id: "edge/sb", kind: "REQUIRES", from: "ev/never-declared", to: "ev/rite-b" },
      ],
      "canon/compete"
    );
    const baseline = derive(canon, []);
    expect(occurrencesOfType(baseline, "type/rite").filter((o) => o.occurred).map((o) => o.occurrenceId)).toEqual([
      "ev/rite-a",
    ]);

    const shifted = derive(canon, [negateEvent("ev/rite-a"), forceEvent("ev/rite-b")]);
    const d = diffOccurrences(baseline, shifted, "type/rite");
    expect(d.removed).toEqual(["ev/rite-a"]);
    expect(d.added).toEqual(["ev/rite-b"]);
    expect(d.substituted).toBe(true);
    expect(d.setChanged).toBe(true);
    expect(d.typeCeased).toBe(false);
  });

  it("flags typeCeased when the kind of thing stops happening entirely", () => {
    const canon = twinCanon();
    const baseline = derive(canon, []);
    const gone = derive(canon, [negateEvent("ev/rite-1"), negateEvent("ev/rite-2")]);
    const d = diffOccurrences(baseline, gone, "type/rite");
    expect(d.typeCeased).toBe(true);
    expect(d.substituted).toBe(false);
    // setChanged is FALSE: it requires the type to persist in both worlds.
    expect(d.setChanged).toBe(false);
    expect(occurrenceCount(gone, "type/rite")).toBe(0);
  });

  it("reports statusChanged for an occurrence present in both worlds", () => {
    const canon = twinCanon();
    const baseline = derive(canon, []);
    const branch = derive(canon, [negateEvent("ev/rite-1")]);
    const d = diffOccurrences(baseline, branch, "type/rite");
    expect(d.statusChanged).toEqual([
      { occurrenceId: "ev/rite-1", from: "ESTABLISHED", to: "EXCLUDED" },
    ]);
  });

  it("reports nothing changed when the worlds are identical", () => {
    const canon = twinCanon();
    const baseline = derive(canon, []);
    const d = diffOccurrences(baseline, baseline, "type/rite");
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.retained).toEqual(["ev/rite-1", "ev/rite-2"]);
    expect(d.statusChanged).toEqual([]);
    expect(d.setChanged).toBe(false);
    expect(d.substituted).toBe(false);
    expect(d.typeCeased).toBe(false);
  });

  it("is deterministic", () => {
    const canon = twinCanon();
    const baseline = derive(canon, []);
    const branch = derive(canon, [negateEvent("ev/rite-2")]);
    expect(diffOccurrences(baseline, branch, "type/rite")).toEqual(
      diffOccurrences(baseline, branch, "type/rite")
    );
  });
});

describe("cases A-E: recurrence shapes", () => {
  it("A: same type, multiple INDEPENDENT occurrences", () => {
    const canon = mk(
      [
        { id: "type/t", kind: "EventType", name: "T" },
        { id: "ev/i", kind: "Event", name: "I" },
        { id: "ev/ii", kind: "Event", name: "II" },
      ],
      [instanceOf("fact/i", "ev/i", "type/t"), instanceOf("fact/ii", "ev/ii", "type/t")],
      [],
      "canon/indep"
    );
    const world = derive(canon, [negateEvent("ev/i")]);
    // independent: removing one leaves the other untouched
    expect(world.statuses["ev/ii"]).toBe("ESTABLISHED");
    expect(occurrenceCount(world, "type/t")).toBe(1);
  });

  it("D: occurrences sharing a prerequisite, with different outcomes", () => {
    const canon = mk(
      [
        { id: "type/trial", kind: "EventType", name: "Trial" },
        { id: "ev/omen", kind: "Event", name: "Omen" },
        { id: "ev/trial-1", kind: "Event", name: "Trial I" },
        { id: "ev/trial-2", kind: "Event", name: "Trial II" },
        { id: "ev/acquittal", kind: "Event", name: "Acquittal" },
        { id: "ev/exile", kind: "Event", name: "Exile" },
      ],
      [instanceOf("fact/t1", "ev/trial-1", "type/trial"), instanceOf("fact/t2", "ev/trial-2", "type/trial")],
      [
        { id: "edge/s1", kind: "REQUIRES", from: "ev/omen", to: "ev/trial-1" },
        { id: "edge/s2", kind: "REQUIRES", from: "ev/omen", to: "ev/trial-2" },
        { id: "edge/o1", kind: "REQUIRES", from: "ev/trial-1", to: "ev/acquittal" },
        { id: "edge/o2", kind: "REQUIRES", from: "ev/trial-2", to: "ev/exile" },
      ],
      "canon/trial"
    );
    const world = derive(canon, [negateEvent("ev/trial-1")]);
    expect(world.statuses["ev/omen"]).toBe("ESTABLISHED"); // shared prereq intact
    expect(world.statuses["ev/trial-2"]).toBe("ESTABLISHED"); // sibling untouched
    expect(world.statuses["ev/acquittal"]).toBe("UNSUPPORTED"); // only its own outcome falls
    expect(world.statuses["ev/exile"]).toBe("ESTABLISHED");
  });

  it("E: one occurrence ENABLES a later occurrence of the same type", () => {
    const canon = mk(
      [
        { id: "type/vigil", kind: "EventType", name: "Vigil" },
        { id: "ev/v1", kind: "Event", name: "Vigil I" },
        { id: "ev/v2", kind: "Event", name: "Vigil II" },
      ],
      [instanceOf("fact/v1", "ev/v1", "type/vigil"), instanceOf("fact/v2", "ev/v2", "type/vigil")],
      [
        { id: "edge/en", kind: "ENABLES", from: "ev/v1", to: "ev/v2" },
        { id: "edge/pr", kind: "PRECEDES", from: "ev/v1", to: "ev/v2" },
      ],
      "canon/vigil"
    );
    const world = derive(canon, []);
    expect(occurrenceCount(world, "type/vigil")).toBe(2);
    // ENABLES never refutes: removing the enabler leaves the successor a root.
    const cut = derive(canon, [negateEvent("ev/v1")]);
    expect(cut.statuses["ev/v2"]).toBe("ESTABLISHED");
  });
});
