/**
 * Somnium Engine — the fact-legality rule, and the differential invariant.
 *
 * THE CLAIM UNDER TEST:
 *
 *   > An intervention may assert no more than canon may.
 *
 * P-005's headline rule was stated as a universal over interventions and refuted
 * SEVEN times (ncr-004). Every refutation had the same shape: a guard was
 * defended by enumerating the routes then known, and the next gate found a route
 * outside the enumeration. The last three were found by comparing the
 * intervention path against the canon path and noticing they disagreed:
 *
 *   7a  a slash-free phantom type — the object check tested `includes("/")`
 *   7b  a canon FACT id as a subject — allowed by interventions, forbidden by canon
 *   7c  a type instantiating itself — no signature on `instance_of`
 *
 * So the claim is now DIFFERENTIAL rather than a list, and this file asserts it
 * directly: for every (subject, predicate, object) triple, `factAssertionError`
 * gives the same verdict wherever it is called. That is a property of one
 * function, decidable by exhaustive comparison over a vocabulary — not a survey
 * of routes that grows every time someone thinks of a new one.
 */
import { describe, expect, it } from "vitest";
import type { Canon } from "./types";
import { INSTANCE_OF } from "./types";
import { hashCanon } from "./hash";
import { buildFactVocabulary, factAssertionError } from "./fact-rules";
import { validateCanon } from "./canon";
import { verrinCanon } from "./verrin";
import { ordosCanon } from "./ordos";
import { derive } from "../derive/world-state";
import { setFact } from "../timeline/types";

/** A canon with one of every entity kind, so every position can be exercised. */
function vocabularyCanon(): Canon {
  const canon: Canon = {
    canonId: "canon/vocab",
    version: "1.0.0",
    entities: [
      { id: "ev/one", kind: "Event", name: "One" },
      { id: "ev/two", kind: "Event", name: "Two" },
      { id: "type/rite", kind: "EventType", name: "Rite" },
      { id: "char/vara", kind: "Character", name: "Vara" },
      { id: "loc/hall", kind: "Location", name: "Hall" },
      { id: "obj/seal", kind: "Object", name: "Seal" },
      { id: "inst/order", kind: "Institution", name: "Order" },
      { id: "fac/court", kind: "Faction", name: "Court" },
      { id: "work/tale", kind: "Work", name: "Tale" },
    ],
    facts: [
      {
        id: "fact/one-rite",
        subject: "ev/one",
        predicate: INSTANCE_OF,
        object: "type/rite",
        validFrom: null,
        validTo: null,
        source: "canon",
      },
    ],
    edges: [],
    workBindings: [{ workId: "work/tale", events: ["ev/one"] }],
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

/** Every id a test might name, declared and undeclared, plus literal values. */
const SUBJECTS = [
  "ev/one", // declared Event
  "type/rite", // declared EventType
  "char/vara", // declared Character
  "obj/seal", // declared Object
  "work/tale", // declared Work
  "fact/one-rite", // declared FACT — legal object, ILLEGAL subject
  "ev/ghost", // undeclared, id-shaped
  "ghostsubject", // undeclared, slash-free
];

const PREDICATES = [INSTANCE_OF, "located_in", "note", "held_by"];

const OBJECTS: (string | number | boolean | null)[] = [
  "type/rite", // declared EventType
  "loc/hall", // declared Location
  "fact/one-rite", // declared fact
  "type/ghost", // undeclared, id-shaped
  "phantomtype", // undeclared, SLASH-FREE (route 7a)
  "Type_T2", // undeclared, slash-free variant
  "ash", // literal string
  "ash/ember", // literal string containing a slash (known false positive)
  42, // literal number
  true, // literal boolean
  null, // literal null
];

describe("factAssertionError: the rule itself", () => {
  const vocabulary = buildFactVocabulary(vocabularyCanon());

  it("accepts a declared entity as a subject, of any kind", () => {
    for (const subject of ["ev/one", "type/rite", "char/vara", "obj/seal", "work/tale"]) {
      expect(factAssertionError(subject, "note", "ash", vocabulary)).toBeNull();
    }
  });

  it("rejects a FACT id as a subject — facts describe things, and a fact is not a thing", () => {
    // Route 7b. `validateCanon` has always required an entity here; the
    // intervention path used to allow fact ids, which made it strictly broader.
    const error = factAssertionError("fact/one-rite", "note", "ash", vocabulary);
    expect(error?.reason).toBe("subject-not-entity");
  });

  it("rejects an undeclared subject, id-shaped or not", () => {
    expect(factAssertionError("ev/ghost", "note", "ash", vocabulary)?.reason).toBe(
      "subject-not-entity"
    );
    expect(factAssertionError("ghostsubject", "note", "ash", vocabulary)?.reason).toBe(
      "subject-not-entity"
    );
  });

  describe("instance_of has a typed signature: Event -> EventType", () => {
    it("accepts a declared Event instancing a declared EventType", () => {
      expect(factAssertionError("ev/one", INSTANCE_OF, "type/rite", vocabulary)).toBeNull();
    });

    it("rejects a non-Event subject, including a type instancing itself", () => {
      // Route 7c.
      expect(factAssertionError("type/rite", INSTANCE_OF, "type/rite", vocabulary)?.reason).toBe(
        "instance-of-subject-not-event"
      );
      expect(factAssertionError("char/vara", INSTANCE_OF, "type/rite", vocabulary)?.reason).toBe(
        "instance-of-subject-not-event"
      );
    });

    it("rejects a non-EventType object REGARDLESS of id shape", () => {
      // Route 7a is why this is a range check and not a convention check: the
      // slash-free cases below walked straight past `includes("/")`.
      for (const phantom of ["type/ghost", "phantomtype", "Type_T2", "ghost type", "loc/hall"]) {
        expect(factAssertionError("ev/one", INSTANCE_OF, phantom, vocabulary)?.reason).toBe(
          "instance-of-object-not-event-type"
        );
      }
      // and non-string objects are equally rejected
      for (const literal of [42, true, null]) {
        expect(factAssertionError("ev/one", INSTANCE_OF, literal, vocabulary)?.reason).toBe(
          "instance-of-object-not-event-type"
        );
      }
    });
  });

  describe("other predicates: an id-shaped object must resolve", () => {
    it("accepts a declared entity or fact as an id-valued object", () => {
      expect(factAssertionError("char/vara", "located_in", "loc/hall", vocabulary)).toBeNull();
      expect(factAssertionError("char/vara", "note", "fact/one-rite", vocabulary)).toBeNull();
    });

    it("rejects an unresolvable id-shaped object", () => {
      expect(factAssertionError("char/vara", "located_in", "loc/ghost", vocabulary)?.reason).toBe(
        "object-unresolved-id"
      );
    });

    it("accepts literal values of every scalar type", () => {
      for (const literal of ["ash", 42, true, null]) {
        expect(factAssertionError("ev/one", "note", literal, vocabulary)).toBeNull();
      }
    });

    it("has a KNOWN false positive: a literal string containing a slash", () => {
      // Accepted cost of a convention-based check on an untyped predicate space.
      // It is precisely why the predicates the core NAMES get a typed rule
      // instead — see the instance_of cases above.
      expect(factAssertionError("ev/one", "note", "ash/ember", vocabulary)?.reason).toBe(
        "object-unresolved-id"
      );
    });

    it("has a KNOWN false negative: a slash-free typo reads as a literal", () => {
      // `"locHall"` is indistinguishable from a flavour value. The typed rules
      // are the answer where it matters; elsewhere this is the accepted limit.
      expect(factAssertionError("char/vara", "located_in", "locHall", vocabulary)).toBeNull();
    });
  });
});

/* ========================================================================== */
/* The differential invariant                                                 */
/* ========================================================================== */

describe("an intervention may assert no more than canon may", () => {
  /**
   * The invariant, checked exhaustively over the vocabulary rather than over a
   * list of attack routes: 8 subjects x 4 predicates x 11 objects = 352 triples.
   *
   * For each, compare two independent questions:
   *   canonVerdict       — would `validateCanon` accept this as a canon fact?
   *   interventionVerdict — does `derive` apply it as a `setFact`?
   *
   * The intervention path must never be MORE permissive. (It may be stricter in
   * one deliberate, one-directional way: canon can excuse an unresolved id via
   * `canon.unspecified`, because a canon can declare intent and an intervention
   * cannot.)
   */
  const base = vocabularyCanon();

  /** Would canon accept this fact? Ask the validator, not the rule directly. */
  function canonAccepts(
    subject: string,
    predicate: string,
    object: string | number | boolean | null
  ): boolean {
    const probe: Canon = {
      ...base,
      facts: [
        ...base.facts,
        { id: "fact/probe", subject, predicate, object, validFrom: null, validTo: null, source: "canon" },
      ],
    };
    return validateCanon(probe).length === 0;
  }

  /** Did the intervention actually write the fact? Ask the derived world. */
  function interventionApplies(
    subject: string,
    predicate: string,
    object: string | number | boolean | null
  ): boolean {
    const world = derive(base, [setFact(subject, predicate, object)]);
    return world.facts.some(
      (f) => f.subject === subject && f.predicate === predicate && f.object === object && f.overridden === true
    );
  }

  const triples: Array<[string, string, string | number | boolean | null]> = [];
  for (const subject of SUBJECTS) {
    for (const predicate of PREDICATES) {
      for (const object of OBJECTS) {
        triples.push([subject, predicate, object]);
      }
    }
  }

  it(`covers ${SUBJECTS.length} x ${PREDICATES.length} x ${OBJECTS.length} triples`, () => {
    expect(triples.length).toBe(SUBJECTS.length * PREDICATES.length * OBJECTS.length);
    expect(triples.length).toBeGreaterThan(300);
  });

  it("the intervention path is never MORE permissive than canon", () => {
    // The whole invariant, in one assertion. Any triple canon rejects and an
    // intervention applies is a violation — this is the test that would have
    // caught routes 7a, 7b and 7c without anyone having to think of them.
    const violations: string[] = [];
    for (const [subject, predicate, object] of triples) {
      if (!canonAccepts(subject, predicate, object) && interventionApplies(subject, predicate, object)) {
        violations.push(`${subject} --${predicate}--> ${String(object)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("and every triple canon accepts, an intervention applies", () => {
    // The other direction, so the gate cannot be satisfied by refusing
    // everything. Deliberate exception: `unspecified` is a canon-only mechanism,
    // and this fixture declares none, so the two paths should agree exactly.
    const overStrict: string[] = [];
    for (const [subject, predicate, object] of triples) {
      if (canonAccepts(subject, predicate, object) && !interventionApplies(subject, predicate, object)) {
        overStrict.push(`${subject} --${predicate}--> ${String(object)}`);
      }
    }
    expect(overStrict).toEqual([]);
  });

  it("the two paths agree on the count of legal triples, and it is neither 0 nor all", () => {
    // Guards against a vacuous pass: if the rule accepted everything or nothing,
    // both directions above would be trivially satisfied.
    const legal = triples.filter(([s, p, o]) => canonAccepts(s, p, o));
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.length).toBeLessThan(triples.length);
    for (const [s, p, o] of legal) {
      expect(interventionApplies(s, p, o)).toBe(true);
    }
  });

  it("`unspecified` is the ONE deliberate asymmetry, and only in the safe direction", () => {
    // A canon may excuse an unresolved id reference by declaring intent; an
    // intervention has no such mechanism. So canon can be MORE permissive here,
    // never less — the direction that cannot manufacture world state.
    const withUnspecified: Canon = { ...base, unspecified: ["loc/ghost"] };
    const probe: Canon = {
      ...withUnspecified,
      facts: [
        ...base.facts,
        {
          id: "fact/probe",
          subject: "char/vara",
          predicate: "located_in",
          object: "loc/ghost",
          validFrom: null,
          validTo: null,
          source: "canon",
        },
      ],
    };
    expect(validateCanon(probe)).toEqual([]); // canon: allowed, by declared intent
    const world = derive(withUnspecified, [setFact("char/vara", "located_in", "loc/ghost")]);
    expect(world.facts.some((f) => f.object === "loc/ghost")).toBe(false); // intervention: refused
    expect(world.contradictions.length).toBe(1);
  });
});

/* ========================================================================== */
/* The seed canons, on the routes that defeated earlier passes                 */
/* ========================================================================== */

describe("shipped canons cannot be corrupted by a fact write", () => {
  const CASES = [
    { name: "verrin", canon: verrinCanon(), event: "ev/kael-oath", type: "type/oath-sworn" },
    { name: "ordos", canon: ordosCanon(), event: "ev/vaela-invested", type: "type/investiture" },
  ];

  it.each(CASES)("$name: a slash-free phantom type is refused (route 7a)", ({ canon, event, type }) => {
    const baseline = derive(canon, []);
    const world = derive(canon, [setFact(event, INSTANCE_OF, "phantomtype")]);
    // the phantom has no members...
    expect(world.facts.some((f) => f.object === "phantomtype")).toBe(false);
    // ...and the real membership is untouched
    expect(world.facts.filter((f) => f.predicate === INSTANCE_OF && f.object === type).length).toBe(
      baseline.facts.filter((f) => f.predicate === INSTANCE_OF && f.object === type).length
    );
    expect(world.contradictions.length).toBe(1);
  });

  it.each(CASES)("$name: a canon fact id cannot be enrolled (route 7b)", ({ canon, type }) => {
    const baseline = derive(canon, []);
    const factId = canon.facts[0]?.id as string;
    const world = derive(canon, [setFact(factId, INSTANCE_OF, type)]);
    expect(world.facts.filter((f) => f.predicate === INSTANCE_OF && f.object === type).length).toBe(
      baseline.facts.filter((f) => f.predicate === INSTANCE_OF && f.object === type).length
    );
    expect(
      world.contradictions.some((r) => /fact-write-illegal:subject-not-entity/.test(r.id))
    ).toBe(true);
  });

  it.each(CASES)("$name: a type cannot instantiate itself (route 7c)", ({ canon, type }) => {
    const world = derive(canon, [setFact(type, INSTANCE_OF, type)]);
    expect(world.facts.some((f) => f.subject === type && f.predicate === INSTANCE_OF)).toBe(false);
    expect(
      world.contradictions.some((r) => /fact-write-illegal:instance-of-subject-not-event/.test(r.id))
    ).toBe(true);
  });

  it.each(CASES)("$name: still validates with zero errors", ({ canon }) => {
    expect(validateCanon(canon)).toEqual([]);
  });
});
