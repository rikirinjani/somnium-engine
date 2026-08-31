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
import { occurs } from "../derive/judgment";
import type { Intervention } from "../timeline/types";
import {
  addEdge,
  forceEvent,
  negateEvent,
  relocate,
  retractFact,
  setFact,
  severEdge,
} from "../timeline/types";
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

  it("forcing an UNDECLARED occurrence does not put it in the world, and is recorded", () => {
    // P-005 DEFECT FIX (1 of 3). Before any fix, `forceEvent` on an id canon
    // never declared returned ESTABLISHED with support HARD and zero
    // contradictions.
    //
    // The FIRST fix set truth TRUE and let Phase D join it to BOTH, giving
    // status CONTRADICTORY. That looked right and was wrong where it mattered:
    // `occurs()` accepts BOTH, so the invented occurrence was still counted by
    // `occurrenceCount`, still joined an `EventType`, and still opened the
    // validity window of any canon fact anchored to it. Found by the second L2
    // gate (ncr-004).
    //
    // The world provably does not contain the occurrence — canon defines the
    // vocabulary — so truth is FALSE and every downstream consumer (`occurs`,
    // fact windows, counting, diffing) is correct for free, because they all
    // read truth. The incoherence of the INTERVENTION lives in the records,
    // which is the authoritative surface for contradictions; `statuses` is a
    // documented lossy projection.
    const world = derive(canon, [forceEvent("ev/ghost")]);

    // not in the world
    expect(world.judgments["ev/ghost"]).toMatchObject({ truth: "FALSE", forced: true });
    expect(world.statuses["ev/ghost"]).toBe("UNSUPPORTED");
    // ...and the incoherent intervention is reported with provenance
    const record = world.contradictions.find((r) => r.id === "contra:ev/ghost:force-undeclared");
    expect(record).toBeDefined();
    expect(record?.source).toBe("forceEvent:ev/ghost");
    expect(record?.detail).toMatch(/never declares it/);
  });

  it("a forced undeclared id can never be counted or open a fact window", () => {
    // The two consequences that made the BOTH reading unacceptable. `truth: FALSE`
    // closes both at once.
    const withWindow = mk(
      [
        { id: "ev/rite", kind: "Event", name: "Rite" },
        { id: "type/t", kind: "EventType", name: "T" },
      ],
      [
        instanceOf("fact/rite-t", "ev/rite", "type/t"),
        // a canon fact whose window opens at the undeclared id
        {
          id: "fact/opened",
          subject: "ev/rite",
          predicate: "note",
          object: "opened-by-ghost",
          validFrom: "ev/ghost",
          validTo: null,
          source: "canon",
        },
      ],
      [],
      "canon/window"
    );

    const world = derive(withWindow, [
      forceEvent("ev/ghost"),
      setFact("ev/ghost", INSTANCE_OF, "type/t"),
    ]);
    expect(occurrenceCount(world, "type/t")).toBe(1); // only the declared rite
    expect(world.facts.some((f) => f.id === "fact/opened")).toBe(false);
    expect(world.contradictions.some((r) => r.id === "contra:ev/ghost:force-undeclared")).toBe(true);
  });

  it("forcing many undeclared ids cannot inflate an occurrence count", () => {
    // The scaling version: five forced ghosts on a canon declaring one occurrence.
    const withType = mk(
      [
        { id: "ev/rite", kind: "Event", name: "Rite" },
        { id: "type/t", kind: "EventType", name: "T" },
      ],
      [instanceOf("fact/rite-t", "ev/rite", "type/t")],
      [],
      "canon/many"
    );
    const world = derive(
      withType,
      [1, 2, 3, 4, 5].flatMap((n) => [
        forceEvent(`ev/g${n}`),
        setFact(`ev/g${n}`, INSTANCE_OF, "type/t"),
      ])
    );
    expect(occurrenceCount(world, "type/t")).toBe(1);
    expect(world.contradictions.filter((r) => /force-undeclared/.test(r.id)).length).toBe(5);
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

    it("an invented id can never join a type, be enrolled, or be counted", () => {
      // P-005 DEFECT FIX (4 of 4), found by the fourth L2 gate.
      //
      // This test previously asserted only `occurrenceCount === 0` and the
      // occurred-filtered rows, while its NAME claimed the id could never join a
      // type. The name asserted strictly more than the body, and the gap was
      // real: `setFact(ghost, instance_of, type)` alone — no forceEvent, no
      // conflict, no record — enrolled the invented id as a non-occurring member
      // row, and `typeOfOccurrence(ghost)` resolved to the type.
      //
      // Nothing occurred and nothing was counted, so it was not a truth-level
      // hole. But `validateCanon` already forbids a canon fact whose subject is
      // undeclared, and interventions were exempt from the same rule — the same
      // asymmetry as the original defect, where `hardSupport` had a gate and
      // `forceEvent` walked around it. Canon defines the vocabulary; an
      // intervention selects among it. Fact writes are now held to that too.
      const world = derive(canon, [
        addEdge({ id: "edge/g", kind: "REQUIRES", from: "ev/real", to: "ev/ghost" }),
        setFact("ev/ghost", INSTANCE_OF, "type/t"),
      ]);

      // not counted, and not present even as a non-occurring member row
      expect(occurrenceCount(world, "type/t")).toBe(0);
      expect(occurrencesOfType(world, "type/t").filter((o) => o.occurred)).toEqual([]);
      expect(occurrencesOfType(world, "type/t").map((o) => o.occurrenceId)).not.toContain("ev/ghost");
      expect(typeOfOccurrence(world, "ev/ghost")).toBeUndefined();

      // ...and the rejected write is reported, never silently dropped
      const record = world.contradictions.find(
        (r) => r.id === "contra:ev/ghost:fact-write-illegal:subject-not-entity"
      );
      expect(record).toBeDefined();
      expect(record?.source).toBe("setFact:ev/ghost.instance_of");
      expect(record?.detail).toMatch(/is not a declared entity/);
    });

    it("a fact write about a declared non-event subject is still legal", () => {
      // The gate must not over-fire. A fact's subject may be any declared
      // entity — Character, Location, Object, EventType, Work — none of which is
      // a causal node. Only `declared` (events + facts) gates causal truth;
      // `declaredSubjects` (all entities + facts) gates fact writes.
      const withSubjects = mk(
        [
          { id: "ev/real", kind: "Event", name: "Real" },
          { id: "type/t", kind: "EventType", name: "T" },
          { id: "char/vara", kind: "Character", name: "Vara" },
          { id: "loc/hall", kind: "Location", name: "Hall" },
        ],
        [],
        [],
        "canon/subjects"
      );
      const world = derive(withSubjects, [
        setFact("char/vara", "located_in", "loc/hall"),
        relocate("char/vara", "loc/hall"),
        setFact("ev/real", "mood", "grim"),
        setFact("type/t", "note", "a type may be a subject"),
      ]);
      expect(world.contradictions).toEqual([]);
      expect(world.facts.find((f) => f.subject === "char/vara" && f.predicate === "located_in")?.object).toBe(
        "loc/hall"
      );
      expect(world.facts.find((f) => f.subject === "ev/real" && f.predicate === "mood")?.object).toBe("grim");
    });

    it("scales: many enrolment attempts cannot grow a type's membership", () => {
      const world = derive(
        canon,
        [1, 2, 3, 4, 5, 6, 7, 8].map((n) => setFact(`ev/g${n}`, INSTANCE_OF, "type/t"))
      );
      expect(occurrencesOfType(world, "type/t")).toEqual([]);
      expect(
        world.contradictions.filter((r) => /fact-write-illegal:subject-not-entity/.test(r.id)).length
      ).toBe(8);
    });

    it("a declared subject cannot be enrolled in an INVENTED type", () => {
      // Route 6, found while probing the subject fix: the subject rule alone left
      // `setFact(real, instance_of, type/ghost)` inventing an EventType, and
      // `occurrenceCount(type/ghost)` returned 1.
      //
      // The fix is NOT another id-shape check. `instance_of` is named by the core
      // (src/canon/types.ts), so the core owns its signature: Event -> EventType.
      // A range check does not care whether the phantom id contains a slash,
      // which is what defeated the convention-based version (route 7a).
      const withTypes = mk(
        [
          { id: "ev/real", kind: "Event", name: "Real" },
          { id: "type/t", kind: "EventType", name: "T" },
        ],
        [instanceOf("fact/real-t", "ev/real", "type/t")],
        [],
        "canon/objects"
      );
      const world = derive(withTypes, [setFact("ev/real", INSTANCE_OF, "type/ghost")]);

      expect(occurrencesOfType(world, "type/ghost")).toEqual([]);
      expect(occurrenceCount(world, "type/ghost")).toBe(0);
      // the real membership is untouched — the write was refused, not applied
      expect(typeOfOccurrence(world, "ev/real")).toBe("type/t");
      expect(occurrenceCount(world, "type/t")).toBe(1);
      expect(
        world.contradictions.some(
          (r) => r.id === "contra:ev/real:fact-write-illegal:instance-of-object-not-event-type"
        )
      ).toBe(true);
    });

    it("a SLASH-FREE phantom type is rejected too", () => {
      // Route 7a: the convention-based object check tested `includes("/")`, so
      // dropping the slash walked straight past it. On the shipped Verrin canon
      // `setFact("ev/kael-oath", instance_of, "phantomtype")` gave
      // occurrenceCount("phantomtype") === 1. The typed signature has no such gap.
      const withTypes = mk(
        [
          { id: "ev/real", kind: "Event", name: "Real" },
          { id: "type/t", kind: "EventType", name: "T" },
        ],
        [instanceOf("fact/real-t", "ev/real", "type/t")],
        [],
        "canon/slashfree"
      );
      for (const phantom of ["phantomtype", "Type_T2", "type.ghost", "ghost type"]) {
        const world = derive(withTypes, [setFact("ev/real", INSTANCE_OF, phantom)]);
        expect(occurrenceCount(world, phantom)).toBe(0);
        expect(typeOfOccurrence(world, "ev/real")).toBe("type/t");
        expect(world.contradictions.length).toBe(1);
      }
    });

    it("a canon FACT id cannot be enrolled as an occurrence", () => {
      // Route 7b: `declaredSubjects` had included fact ids, so
      // `setFact("fact/seal-held-vaela", instance_of, "type/investiture")`
      // inflated Ordos's count from 1 to 2 — while `validateCanon` rejects the
      // identical canon fact, because only an ENTITY may be a fact's subject.
      // The intervention path was strictly broader than the canon path.
      const withFact = mk(
        [
          { id: "ev/real", kind: "Event", name: "Real" },
          { id: "type/t", kind: "EventType", name: "T" },
        ],
        [instanceOf("fact/real-t", "ev/real", "type/t")],
        [],
        "canon/factsubject"
      );
      const world = derive(withFact, [setFact("fact/real-t", INSTANCE_OF, "type/t")]);
      expect(occurrenceCount(world, "type/t")).toBe(1);
      expect(occurrencesOfType(world, "type/t").map((o) => o.occurrenceId)).toEqual(["ev/real"]);
      expect(
        world.contradictions.some(
          (r) => r.id === "contra:fact/real-t:fact-write-illegal:subject-not-entity"
        )
      ).toBe(true);
    });

    it("a type cannot instantiate itself", () => {
      // Route 7c: an EventType is a legal fact SUBJECT in general, so
      // `setFact(type/t, instance_of, type/t)` used to add the type to its own
      // membership list. The domain half of the signature (Event -> EventType)
      // rules it out.
      const withTypes = mk(
        [
          { id: "ev/real", kind: "Event", name: "Real" },
          { id: "type/t", kind: "EventType", name: "T" },
        ],
        [instanceOf("fact/real-t", "ev/real", "type/t")],
        [],
        "canon/selftype"
      );
      const world = derive(withTypes, [setFact("type/t", INSTANCE_OF, "type/t")]);
      expect(occurrencesOfType(world, "type/t").map((o) => o.occurrenceId)).toEqual(["ev/real"]);
      expect(typeOfOccurrence(world, "type/t")).toBeUndefined();
      expect(
        world.contradictions.some(
          (r) => r.id === "contra:type/t:fact-write-illegal:instance-of-subject-not-event"
        )
      ).toBe(true);
    });

    it("does not over-fire on legitimate id-valued or literal objects", () => {
      const withSubjects = mk(
        [
          { id: "ev/real", kind: "Event", name: "Real" },
          { id: "char/vara", kind: "Character", name: "Vara" },
          { id: "loc/hall", kind: "Location", name: "Hall" },
        ],
        [],
        [],
        "canon/objects-ok"
      );
      const world = derive(withSubjects, [
        setFact("char/vara", "located_in", "loc/hall"), // declared id object
        relocate("char/vara", "loc/hall"), // same, via relocate
        setFact("ev/real", "mood", "grim"), // literal string
        setFact("ev/real", "count", 3), // literal number
        setFact("ev/real", "flag", true), // literal boolean
      ]);
      expect(world.contradictions).toEqual([]);
      expect(world.facts.find((f) => f.predicate === "located_in")?.object).toBe("loc/hall");
      expect(world.facts.find((f) => f.predicate === "mood")?.object).toBe("grim");
      expect(world.facts.find((f) => f.predicate === "count")?.object).toBe(3);
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

  /**
   * THE UNDECLARED INVARIANT, quantified over the intervention vocabulary.
   *
   * Three earlier passes each stated this rule as a universal and each was
   * defeated by a route the previous fix had not enumerated. The fourth defeat
   * was the sharpest: `negateEvent` and `forceEvent` are each individually
   * harmless on a ghost, but COMPOSED they emitted `forced-vs-negated` instead
   * of `forced-undeclared`, which was not in the kind-exclusion set, so truth
   * was tainted to BOTH and `occurs()` accepted it.
   *
   * The lesson is about test shape, not about that one pair: a claim quantified
   * over "any intervention" needs a test quantified over the vocabulary, not a
   * hand-picked list of routes. These tests enumerate every kind alone and every
   * kind composed with `forceEvent` (the only kind that asserts occurrence), and
   * assert the invariant directly rather than checking statuses.
   */
  describe("the undeclared invariant, over the whole intervention vocabulary", () => {
    const GHOST = "ev/ghost";

    /** Every intervention kind, applied to the same undeclared id. */
    const SINGLE: Array<[string, Intervention]> = [
      ["negateEvent", negateEvent(GHOST)],
      ["forceEvent", forceEvent(GHOST)],
      ["setFact", setFact(GHOST, INSTANCE_OF, "type/t")],
      ["relocate", relocate(GHOST, "loc/nowhere")],
      ["retractFact", retractFact(GHOST)],
      ["severEdge", severEdge(GHOST)],
      ["addEdge/target", addEdge({ id: "edge/gt", kind: "REQUIRES", from: "ev/real", to: GHOST })],
      ["addEdge/source", addEdge({ id: "edge/gs", kind: "REQUIRES", from: GHOST, to: "ev/real" })],
      ["addEdge/enables", addEdge({ id: "edge/ge", kind: "ENABLES", from: "ev/real", to: GHOST })],
      ["addEdge/excludes", addEdge({ id: "edge/gx", kind: "EXCLUDES", from: "ev/real", to: GHOST })],
      ["addEdge/invariant", addEdge({ id: "edge/gi", kind: "INVARIANT", from: "ev/real", to: GHOST })],
      ["addEdge/precedes", addEdge({ id: "edge/gp", kind: "PRECEDES", from: "ev/real", to: GHOST })],
      ["addEdge/motivates", addEdge({ id: "edge/gm", kind: "MOTIVATES", from: "ev/real", to: GHOST })],
    ];

    /** The canon under test: one declared occurrence, one type, two windowed facts. */
    function invariantCanon(): Canon {
      return mk(
        [
          { id: "ev/real", kind: "Event", name: "Real" },
          { id: "type/t", kind: "EventType", name: "T" },
        ],
        [
          instanceOf("fact/real-t", "ev/real", "type/t"),
          // a window that would OPEN if the ghost occurred
          { id: "fact/opens", subject: "ev/real", predicate: "note", object: "opened", validFrom: GHOST, validTo: null, source: "canon" },
          // a window that would CLOSE if the ghost occurred
          { id: "fact/closes", subject: "ev/real", predicate: "note2", object: "closed", validFrom: null, validTo: GHOST, source: "canon" },
        ],
        [],
        "canon/invariant"
      );
    }

    /**
     * The invariant, asserted directly: the GHOST is absent from the world.
     *
     * Deliberately NOT "the declared occurrence count is unchanged". The
     * `addEdge/source` case taught that lesson: adding `ev/ghost REQUIRES
     * ev/real` legitimately makes `ev/real` stop occurring, because its new
     * prerequisite is unknown (P-003 case K). The declared count dropping to 0
     * is correct there. What must never happen is the ghost itself occurring.
     */
    function expectGhostAbsent(world: ReturnType<typeof derive>): void {
      const judgment = world.judgments[GHOST];
      // Either the id never became a node at all, or it is a node that does not occur.
      if (judgment !== undefined) {
        expect(occurs(judgment)).toBe(false);
      }
      // it never counts as an occurrence of the type
      expect(
        occurrencesOfType(world, "type/t")
          .filter((o) => o.occurred)
          .map((o) => o.occurrenceId)
      ).not.toContain(GHOST);
      // a window that opens at the ghost never opens...
      expect(world.facts.some((f) => f.id === "fact/opens")).toBe(false);
      // ...and a window that closes at the ghost is never retired
      expect(world.facts.some((f) => f.id === "fact/closes")).toBe(true);
    }

    it.each(SINGLE)("%s alone cannot make the ghost occur", (_label, iv) => {
      const world = derive(invariantCanon(), [iv]);
      expectGhostAbsent(world);
    });

    it.each(SINGLE)("%s COMPOSED with forceEvent cannot make the ghost occur", (_label, iv) => {
      // Composition is where the fourth defeat lived: two individually-safe
      // interventions producing an unsafe world.
      const world = derive(invariantCanon(), [iv, forceEvent(GHOST)]);
      expectGhostAbsent(world);
    });

    it("negateEvent + forceEvent on a ghost reports force-undeclared, not force-vs-negate", () => {
      // The specific defeat, pinned. Non-existence is the primary defect: an
      // incoherent intervention about a thing not in the world is not usefully
      // described as "forced and also negated".
      for (const chain of [
        [negateEvent(GHOST), forceEvent(GHOST)],
        [forceEvent(GHOST), negateEvent(GHOST)],
      ]) {
        const world = derive(invariantCanon(), chain);
        expect(world.judgments[GHOST]).toMatchObject({ truth: "FALSE" });
        expect(world.contradictions.map((r) => r.id)).toEqual([`contra:${GHOST}:force-undeclared`]);
      }
    });

    it("scales: many ghosts through the composed route cannot inflate a count", () => {
      const chain = [1, 2, 3, 4, 5].flatMap((n) => [
        negateEvent(`ev/g${n}`),
        forceEvent(`ev/g${n}`),
        setFact(`ev/g${n}`, INSTANCE_OF, "type/t"),
      ]);
      const world = derive(invariantCanon(), chain);
      expect(occurrenceCount(world, "type/t")).toBe(1);
      expect(world.contradictions.filter((r) => /force-undeclared/.test(r.id)).length).toBe(5);
    });

    it("the invariant holds for EVERY non-declared node in the derived world", () => {
      // The invariant stated directly, rather than as a list of routes: whatever
      // ends up in the node set, nothing canon failed to declare may occur.
      const canonUnderTest = invariantCanon();
      const declared = new Set([
        ...canonUnderTest.entities.filter((e) => e.kind === "Event").map((e) => e.id),
        ...canonUnderTest.facts.map((f) => f.id),
      ]);
      const world = derive(canonUnderTest, [
        negateEvent(GHOST),
        forceEvent(GHOST),
        forceEvent("ev/other-ghost"),
        addEdge({ id: "edge/g1", kind: "REQUIRES", from: "ev/real", to: "ev/third-ghost" }),
        setFact(GHOST, INSTANCE_OF, "type/t"),
      ]);

      const offenders = Object.entries(world.judgments)
        .filter(([id, j]) => !declared.has(id) && occurs(j))
        .map(([id]) => id);
      expect(offenders).toEqual([]);
    });

    it("does NOT over-fire: declared nodes still reach BOTH on a real conflict", () => {
      // The gate is a predicate on the node, so it must not weaken the
      // contradiction model P-003 built for declared nodes.
      const declaredCanon = mk(
        [
          { id: "ev/a", kind: "Event", name: "A" },
          { id: "ev/b", kind: "Event", name: "B" },
        ],
        [],
        [{ id: "edge/ab", kind: "REQUIRES", from: "ev/a", to: "ev/b" }],
        "canon/over-fire"
      );

      // forced-vs-negated on a DECLARED node still taints
      const negForce = derive(declaredCanon, [negateEvent("ev/a"), forceEvent("ev/a")]);
      expect(negForce.judgments["ev/a"]).toMatchObject({ truth: "BOTH" });
      expect(negForce.statuses["ev/a"]).toBe("CONTRADICTORY");

      // forced-vs-refuted on a DECLARED node still taints
      const forcedRefuted = derive(declaredCanon, [negateEvent("ev/a"), forceEvent("ev/b")]);
      expect(forcedRefuted.judgments["ev/b"]).toMatchObject({ truth: "BOTH" });
      expect(forcedRefuted.statuses["ev/b"]).toBe("CONTRADICTORY");
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
