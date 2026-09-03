/**
 * Somnium Engine — derive() integration tests (world-state contract).
 *
 * Uses a small inline fixture canon — deliberately NOT src/canon/verrin.ts
 * (written by the canon lane in parallel).
 *
 * Fixture layout:
 *   Events (all root except where a REQUIRES edge says otherwise):
 *     ev/root1, ev/root2, ev/end (roots)
 *     ev/child1 REQUIRES ev/root1; ev/grandchild REQUIRES ev/child1
 *     ev/peer REQUIRES ev/root2
 *     ev/team-a, ev/team-b REQUIRES ev/root2 + EXCLUDES each other
 *     ev/doomed REQUIRES ev/team-a + INVARIANT from ev/root1
 *     ev/cyc-a <-> ev/cyc-b (REQUIRES cycle, stays UNKNOWN)
 *     ev/soft REQUIRES ev/cyc-a + ENABLES from ev/root1 (CONTINGENT)
 *   Facts: char/hero located_in loc/home (validTo ev/end),
 *          char/hero located_in loc/away (validFrom ev/end)
 */
import { describe, expect, it } from "vitest";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "../canon/types";
import { hashCanon } from "../canon/hash";
import { derive, type WorldState } from "./world-state";
import { negateEvent, forceEvent, setFact, retractFact, severEdge, addEdge, relocate, type RewindPoint } from "../timeline/types";

function makeCanon(): Canon {
  const entities: Entity[] = [
    { id: "char/hero", kind: "Character", name: "Hero" },
    { id: "loc/home", kind: "Location", name: "Home" },
    { id: "loc/away", kind: "Location", name: "Away" },
    { id: "ev/root1", kind: "Event", name: "Root One" },
    { id: "ev/root2", kind: "Event", name: "Root Two" },
    { id: "ev/end", kind: "Event", name: "The Pivot" },
    { id: "ev/child1", kind: "Event", name: "Child One" },
    { id: "ev/grandchild", kind: "Event", name: "Grandchild" },
    { id: "ev/peer", kind: "Event", name: "Peer" },
    { id: "ev/team-a", kind: "Event", name: "Team A" },
    { id: "ev/team-b", kind: "Event", name: "Team B" },
    { id: "ev/doomed", kind: "Event", name: "Doomed" },
    { id: "ev/cyc-a", kind: "Event", name: "Cycle A" },
    { id: "ev/cyc-b", kind: "Event", name: "Cycle B" },
    { id: "ev/soft", kind: "Event", name: "Soft" },
  ];
  const facts: Fact[] = [
    { id: "fact/hero-home", subject: "char/hero", predicate: "located_in", object: "loc/home", validFrom: null, validTo: "ev/end", source: "canon" },
    { id: "fact/hero-away", subject: "char/hero", predicate: "located_in", object: "loc/away", validFrom: "ev/end", validTo: null, source: "canon" },
  ];
  const edges: CausalEdge[] = [
    { id: "edge/child1-requires-root1", kind: "REQUIRES", from: "ev/root1", to: "ev/child1" },
    { id: "edge/grandchild-requires-child1", kind: "REQUIRES", from: "ev/child1", to: "ev/grandchild" },
    { id: "edge/peer-requires-root2", kind: "REQUIRES", from: "ev/root2", to: "ev/peer" },
    { id: "edge/team-a-requires-root2", kind: "REQUIRES", from: "ev/root2", to: "ev/team-a" },
    { id: "edge/team-b-requires-root2", kind: "REQUIRES", from: "ev/root2", to: "ev/team-b" },
    { id: "edge/doomed-requires-team-a", kind: "REQUIRES", from: "ev/team-a", to: "ev/doomed" },
    { id: "edge/cyc-a-requires-cyc-b", kind: "REQUIRES", from: "ev/cyc-b", to: "ev/cyc-a" },
    { id: "edge/cyc-b-requires-cyc-a", kind: "REQUIRES", from: "ev/cyc-a", to: "ev/cyc-b" },
    { id: "edge/soft-requires-cyc-a", kind: "REQUIRES", from: "ev/cyc-a", to: "ev/soft" },
    { id: "edge/team-excludes", kind: "EXCLUDES", from: "ev/team-a", to: "ev/team-b" },
    { id: "edge/invariant-doomed", kind: "INVARIANT", from: "ev/root1", to: "ev/doomed" },
    { id: "edge/soft-enabled", kind: "ENABLES", from: "ev/root1", to: "ev/soft" },
  ];
  const workBindings: WorkBinding[] = [
    { workId: "work/chain", events: ["ev/root1", "ev/child1", "ev/grandchild"] },
    { workId: "work/team", events: ["ev/root2", "ev/team-a", "ev/team-b"] },
    { workId: "work/cycle", events: ["ev/cyc-a", "ev/cyc-b"] },
    { workId: "work/soft", events: ["ev/soft"] },
    // P-004 fixtures: a Work whose member event BRINGS ABOUT a fact
    // (fact/hero-away's validFrom is ev/end), and a Work with an explicit STATE
    // requirement (fact/hero-home must be effective).
    { workId: "work/pivot", events: ["ev/end"] },
    { workId: "work/state-bound", events: ["ev/root2"], facts: ["fact/hero-home"] },
  ];
  const canon: Canon = {
    canonId: "canon/derive-unit",
    version: "0.0.1",
    entities,
    facts,
    edges,
    workBindings,
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

const rp: RewindPoint = {
  id: "RP-DERIVE-001",
  canonId: "canon/derive-unit",
  anchorEvent: "ev/end",
  cut: ["ev/end"],
  derivedHash: "00000000",
  label: "fixture rewind point",
  tags: [],
  created: "2026-08-30",
};

/** Effective located_in for char/hero (single-match fixture). */
function locatedIn(ws: WorldState): string | number | boolean | null | undefined {
  return ws.facts.find((f) => f.subject === "char/hero" && f.predicate === "located_in")?.object;
}

describe("derive: determinism", () => {
  it("derives twice to a byte-identical WorldState (identical hashes)", () => {
    const canon = makeCanon();
    const a = derive(canon, []);
    const b = derive(canon, []);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.stateHash).toMatch(/^[0-9a-f]{8}$/);
    expect(a.identityHash).toMatch(/^[0-9a-f]{8}$/);
    expect(a).toEqual(b);
  });

  it("is deterministic with interventions and a rewind point", () => {
    const canon = makeCanon();
    const chain = [negateEvent("ev/root2"), setFact("char/hero", "located_in", "loc/home")];
    const a = derive(canon, chain, rp);
    const b = derive(canon, chain, rp);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.rpId).toBe("RP-DERIVE-001");
    expect(a.statuses).toEqual(b.statuses);
    expect(a.facts).toEqual(b.facts);
    expect(a.contradictions).toEqual(b.contradictions);
  });

  it("emits statuses with deterministic sorted keys", () => {
    const ws = derive(makeCanon(), []);
    const keys = Object.keys(ws.statuses);
    expect(keys).toEqual([...keys].sort());
    expect(keys).toContain("ev/root1");
    expect(keys).not.toContain("char/hero"); // characters are not status nodes
  });
});

describe("derive: fact validity windows", () => {
  it("baseline: pivot occurred => the validFrom fact wins (away)", () => {
    const ws = derive(makeCanon(), []);
    expect(locatedIn(ws)).toBe("loc/away");
    expect(ws.facts.find((f) => f.id === "fact/hero-away")).toBeDefined();
    expect(ws.facts.find((f) => f.id === "fact/hero-home")).toBeUndefined(); // validTo violated
  });

  it("pivot negated => the validTo fact wins (home)", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/end")]);
    expect(locatedIn(ws)).toBe("loc/home");
    expect(ws.facts.find((f) => f.id === "fact/hero-home")).toBeDefined();
    expect(ws.facts.find((f) => f.id === "fact/hero-away")).toBeUndefined(); // validFrom not satisfied
  });

  it("effective facts are sorted by id", () => {
    const ws = derive(makeCanon(), []);
    const ids = ws.facts.map((f) => f.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe("derive: interventions apply in order", () => {
  it("setFact overrides the effective fact (derived, overridden, id preserved)", () => {
    const ws = derive(makeCanon(), [setFact("char/hero", "located_in", "loc/home")]);
    expect(locatedIn(ws)).toBe("loc/home");
    const derived = ws.facts.find((f) => f.predicate === "located_in");
    expect(derived?.source).toBe("derived");
    expect(derived?.overridden).toBe(true);
    expect(derived?.id).toBe("fact/hero-away"); // keeps the replaced canon fact's id
  });

  it("retractFact removes an effective fact", () => {
    const ws = derive(makeCanon(), [retractFact("fact/hero-away")]);
    expect(ws.facts).toEqual([]);
    expect(locatedIn(ws)).toBeUndefined();
  });

  it("setFact then retractFact: retraction wins", () => {
    const ws = derive(makeCanon(), [setFact("char/hero", "located_in", "loc/home"), retractFact("fact/hero-away")]);
    expect(ws.facts).toEqual([]);
  });

  it("retractFact then setFact: the derived fact survives (synthetic id)", () => {
    const ws = derive(makeCanon(), [retractFact("fact/hero-away"), setFact("char/hero", "located_in", "loc/home")]);
    expect(locatedIn(ws)).toBe("loc/home");
    const derived = ws.facts.find((f) => f.predicate === "located_in");
    // P-007 gate 3: the minted id joins subject and predicate with NUL, not ".",
    // because the fact list is id-keyed downstream and a "." join is not
    // injective — `(char/ash, "the.elder.mood")` and `(char/ash.the.elder,
    // "mood")` minted ONE id for two distinct cells. Same key `buildModel` uses.
    expect(derived?.id).toBe("derived:char/hero\u0000located_in");
    expect(derived?.source).toBe("derived");
  });

  it("setFact for an unknown attribute creates a synthetic derived fact", () => {
    const ws = derive(makeCanon(), [setFact("ev/root1", "mood", "calm")]);
    const derived = ws.facts.find((f) => f.predicate === "mood");
    expect(derived).toEqual({
      id: "derived:ev/root1\u0000mood", // NUL-separated, injective (P-007 gate 3)
      subject: "ev/root1",
      predicate: "mood",
      object: "calm",
      source: "derived",
      overridden: true,
      validFrom: null,
      validTo: null,
    });
  });
});

describe("derive: work statuses", () => {
  it("classifies every canonical Work", () => {
    const ws = derive(makeCanon(), []);
    expect(Object.keys(ws.workStatuses).sort()).toEqual([
      "work/chain",
      "work/cycle",
      "work/pivot",
      "work/soft",
      "work/state-bound",
      "work/team",
    ]);
  });

  it("baseline: chain PRESERVED, team IMPOSSIBLE, bootstrap cycle and its dependent IMPOSSIBLE", () => {
    const ws = derive(makeCanon(), []);
    expect(ws.workStatuses["work/chain"]).toBe("PRESERVED");
    expect(ws.workStatuses["work/team"]).toBe("IMPOSSIBLE"); // team-a/b contradictory
    // P-003 CHANGE (was UNKNOWN). A REQUIRES bootstrap cycle with no external
    // ground is an unfounded set: well-founded semantics rejects it as false,
    // so its events are UNSUPPORTED and the work is IMPOSSIBLE. The old
    // UNKNOWN encoded "we don't know", which was wrong — there is no grounding
    // derivation, and that is knowable.
    expect(ws.workStatuses["work/cycle"]).toBe("IMPOSSIBLE");
    // P-003 CHANGE (was UNREACHABLE). ev/soft REQUIRES ev/cyc-a, which the
    // unfounded-set rejection now makes FALSE, so soft's hard support is
    // genuinely REFUTED. Its ENABLES edge from ev/root1 cannot resurrect it:
    // an enabling condition is not a sufficient cause. Under the old model
    // cyc-a was UNKNOWN, so soft floated at CONTINGENT — that reading depended
    // entirely on the cycle bug.
    expect(ws.workStatuses["work/soft"]).toBe("IMPOSSIBLE");
    expect(ws.statuses["ev/soft"]).toBe("UNSUPPORTED");
    // P-004: work/state-bound requires fact/hero-home, which is NOT effective
    // in baseline (ev/end has occurred, so its validTo window is violated) —
    // the story cannot hold as written.
    expect(ws.workStatuses["work/state-bound"]).toBe("IMPOSSIBLE");
  });

  it("negating the chain root makes the work IMPOSSIBLE", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root1")]);
    expect(ws.workStatuses["work/chain"]).toBe("IMPOSSIBLE");
  });

  it("all events established but facts overridden => ALTERED", () => {
    const ws = derive(makeCanon(), [setFact("ev/root1", "mood", "calm")]);
    expect(ws.statuses["ev/root1"]).toBe("ESTABLISHED");
    expect(ws.workStatuses["work/chain"]).toBe("ALTERED");
  });

  it("ALTERED fires on a fact the Work's events BRING ABOUT (validFrom anchor)", () => {
    // P-004 REGRESSION: the old rule compared an overridden fact's SUBJECT
    // against the Work's event ids, so overriding a fact about a character
    // could never alter a Work. Here the overridden fact's subject is
    // char/hero, but its validFrom (ev/end) IS a member of work/pivot — the
    // pivot event brings the fact about, so the Work depends on it.
    const ws = derive(makeCanon(), [setFact("char/hero", "located_in", "loc/home")]);
    expect(ws.statuses["ev/end"]).toBe("ESTABLISHED");
    expect(ws.workStatuses["work/pivot"]).toBe("ALTERED");
  });

  it("a required fact (work.facts) that is missing makes the Work IMPOSSIBLE", () => {
    // work/state-bound requires fact/hero-home. Negating ev/end makes the fact
    // effective, so the Work holds as written (PRESERVED).
    const ws = derive(makeCanon(), [negateEvent("ev/end")]);
    expect(ws.statuses["ev/root2"]).toBe("ESTABLISHED");
    expect(ws.facts.some((f) => f.id === "fact/hero-home")).toBe(true);
    expect(ws.workStatuses["work/state-bound"]).toBe("PRESERVED");
  });

  it("a required fact that is effective but overridden => ALTERED", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/end"), setFact("char/hero", "located_in", "loc/away")]);
    expect(ws.facts.find((f) => f.predicate === "located_in")?.overridden).toBe(true);
    expect(ws.workStatuses["work/state-bound"]).toBe("ALTERED");
  });

  it("a Work with no facts requirements behaves exactly as pre-P-004", () => {
    // work/chain has no `facts`: overriding an unrelated character fact must
    // NOT alter it (only work/pivot, whose member event anchors that fact).
    const ws = derive(makeCanon(), [setFact("char/hero", "located_in", "loc/home")]);
    expect(ws.workStatuses["work/chain"]).toBe("PRESERVED");
    expect(ws.workStatuses["work/pivot"]).toBe("ALTERED");
  });
});

describe("derive: contradiction records surface, never auto-repaired", () => {
  it("carries every canonical constraint violation with provenance", () => {
    const ws = derive(makeCanon(), []);
    expect(ws.statuses["ev/team-a"]).toBe("CONTRADICTORY");
    expect(ws.statuses["ev/team-b"]).toBe("CONTRADICTORY");
    // P-003 CHANGE (was 2 records). Contradiction is LOCALIZED, not propagated:
    // ev/doomed's support is evaluated against team-a's classical truth, so
    // doomed occurs, which then violates the INVARIANT from ev/root1 and is
    // flagged in its own right. The old code cascaded team-a's contradiction
    // into doomed as UNSUPPORTED, which silently suppressed the invariant
    // violation — a contradiction hiding another contradiction.
    expect(ws.contradictions.map((c) => c.id).sort()).toEqual([
      "contra:edge/invariant-doomed:invariant:ev/doomed",
      "contra:edge/team-excludes:excludes:ev/team-a",
      "contra:edge/team-excludes:excludes:ev/team-b",
    ]);
  });

  it("keeps each record's provenance distinguishable (canon vs intervention)", () => {
    const ws = derive(makeCanon(), [forceEvent("ev/child1"), negateEvent("ev/child1")]);
    const canonRecords = ws.contradictions.filter((c) => c.source === "canon");
    const ivRecords = ws.contradictions.filter((c) => c.source !== "canon");
    expect(canonRecords.length).toBeGreaterThan(0);
    expect(ivRecords.map((c) => c.source)).toContain("forceEvent:ev/child1");
  });
});

describe("derive: stateHash vs identityHash (P-004)", () => {
  it("identical inputs => both hashes identical", () => {
    const canon = makeCanon();
    const chain = [negateEvent("ev/root2"), setFact("char/hero", "located_in", "loc/home")];
    const a = derive(canon, chain, rp);
    const b = derive(canon, chain, rp);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.identityHash).toBe(b.identityHash);
  });

  it("two COMMUTING intervention orders => same stateHash AND same identityHash", () => {
    // negateEvent marks are set-like: canonicalInterventions folds them into a
    // sorted deduplicated set, so both orders are one derivation identity.
    const canon = makeCanon();
    const ab = derive(canon, [negateEvent("ev/root1"), negateEvent("ev/root2")]);
    const ba = derive(canon, [negateEvent("ev/root2"), negateEvent("ev/root1")]);
    expect(ab.statuses).toEqual(ba.statuses);
    expect(ab.stateHash).toBe(ba.stateHash);
    expect(ab.identityHash).toBe(ba.identityHash);
  });

  it("two NON-commuting orders reaching genuinely different worlds => both differ", () => {
    // setFact assignments are sequential cell writes: the last write wins.
    const canon = makeCanon();
    const w1 = derive(canon, [setFact("char/hero", "located_in", "loc/home"), setFact("char/hero", "located_in", "loc/away")]);
    const w2 = derive(canon, [setFact("char/hero", "located_in", "loc/away"), setFact("char/hero", "located_in", "loc/home")]);
    expect(locatedIn(w1)).toBe("loc/away");
    expect(locatedIn(w2)).toBe("loc/home");
    expect(w1.facts).not.toEqual(w2.facts);
    expect(w1.stateHash).not.toBe(w2.stateHash);
    expect(w1.identityHash).not.toBe(w2.identityHash);
  });

  it("two DIFFERENT chains converging on the same effective world => same stateHash, different identityHash", () => {
    // setFact(s, "located_in", X) and relocate(s, X) write the same cell and
    // derive byte-identical content; the chains themselves differ.
    const canon = makeCanon();
    const direct = derive(canon, [setFact("char/hero", "located_in", "loc/home")]);
    const viaRelocate = derive(canon, [relocate("char/hero", "loc/home")]);
    expect(direct.facts).toEqual(viaRelocate.facts);
    expect(direct.statuses).toEqual(viaRelocate.statuses);
    expect(direct.stateHash).toBe(viaRelocate.stateHash); // same WORLD
    expect(direct.identityHash).not.toBe(viaRelocate.identityHash); // reached differently
  });

  it("stateHash is provenance-independent: a different rpId does not change it", () => {
    // rpId is deliberately excluded from stateHash and folded only into
    // identityHash. Deriving with vs without the rewind point must not change
    // the effective-state hash when the world itself is unchanged.
    const canon = makeCanon();
    const bare = derive(canon, []);
    const rewound = derive(canon, [], rp);
    expect(rewound.rpId).toBe("RP-DERIVE-001");
    expect(rewound.stateHash).toBe(bare.stateHash);
    expect(rewound.identityHash).not.toBe(bare.identityHash);
  });
});
