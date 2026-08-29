/**
 * Somnium Engine — propagation fixpoint + contradiction tests.
 *
 * Same inline fixture canon as world-state.test.ts (kept self-contained).
 * Focuses on the causal engine: REQUIRES chains, force-vs-excluded,
 * EXCLUDES, INVARIANT, sever/addEdge, ENABLES contingency, and sorted-order
 * determinism.
 */
import { describe, expect, it } from "vitest";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "../canon/types";
import { hashCanon } from "../canon/hash";
import { derive } from "./world-state";
import { buildModel, propagateStatuses } from "./propagation";
import { negateEvent, forceEvent, severEdge, addEdge } from "../timeline/types";

function makeCanon(): Canon {
  const entities: Entity[] = [
    { id: "char/hero", kind: "Character", name: "Hero" },
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

const s = (ws: ReturnType<typeof derive>, id: string): string => ws.statuses[id] ?? "UNKNOWN";

describe("model construction", () => {
  it("node ids are sorted and pre-marks are collected", () => {
    const model = buildModel(makeCanon(), [negateEvent("ev/root1"), forceEvent("ev/peer")]);
    const ids = model.nodeIds;
    expect(ids).toEqual([...ids].sort());
    expect(model.preMarks.get("ev/root1")).toBe("EXCLUDED");
    expect(model.preMarks.get("ev/peer")).toBe("ESTABLISHED");
    expect(model.forcedBy.get("ev/peer")).toBe("forceEvent:ev/peer");
    expect(model.requiresIn.get("ev/child1")).toEqual(["ev/root1"]);
    expect(model.excludesEdges.map((e) => e.id)).toEqual(["edge/team-excludes"]);
  });

  it("negate + force of the same event pre-marks CONTRADICTORY", () => {
    const model = buildModel(makeCanon(), [forceEvent("ev/peer"), negateEvent("ev/peer")]);
    expect(model.preMarks.get("ev/peer")).toBe("CONTRADICTORY");
    expect(propagateStatuses(model)["ev/peer"]).toBe("CONTRADICTORY");
  });
});

describe("REQUIRES propagation", () => {
  it("baseline: roots and the whole chain are ESTABLISHED", () => {
    const ws = derive(makeCanon(), []);
    expect(s(ws, "ev/root1")).toBe("ESTABLISHED");
    expect(s(ws, "ev/child1")).toBe("ESTABLISHED");
    expect(s(ws, "ev/grandchild")).toBe("ESTABLISHED");
  });

  it("negating the root cascades UNSUPPORTED downstream", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root1")]);
    expect(s(ws, "ev/root1")).toBe("EXCLUDED");
    expect(s(ws, "ev/child1")).toBe("UNSUPPORTED"); // direct REQUIRES
    expect(s(ws, "ev/grandchild")).toBe("UNSUPPORTED"); // transitive
  });

  it("a REQUIRES cycle stays UNKNOWN (never derivable)", () => {
    const ws = derive(makeCanon(), []);
    expect(s(ws, "ev/cyc-a")).toBe("UNKNOWN");
    expect(s(ws, "ev/cyc-b")).toBe("UNKNOWN");
  });
});

describe("force vs exclusion (special case)", () => {
  it("forced event with EXCLUDED REQUIRES source => CONTRADICTORY + one record", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root2"), forceEvent("ev/peer")]);
    expect(s(ws, "ev/root2")).toBe("EXCLUDED");
    expect(s(ws, "ev/peer")).toBe("CONTRADICTORY");
    expect(ws.contradictions).toHaveLength(1);
    expect(ws.contradictions[0]).toEqual({
      id: "contra:ev/peer:force-vs-excluded",
      a: "ev/peer",
      b: "ev/root2",
      detail: expect.stringContaining("ev/peer"),
      source: "forceEvent:ev/peer",
      detectedAt: "ev/peer",
    });
  });

  it("forced event with UNSUPPORTED (not EXCLUDED) source stays ESTABLISHED", () => {
    // ev/grandchild REQUIRES ev/child1. Negate root1 => child1 UNSUPPORTED
    // (a blocked-but-not-excluded prerequisite), but grandchild is forced =>
    // "happens regardless of prerequisites".
    const ws = derive(makeCanon(), [negateEvent("ev/root1"), forceEvent("ev/grandchild")]);
    expect(s(ws, "ev/child1")).toBe("UNSUPPORTED");
    expect(s(ws, "ev/grandchild")).toBe("ESTABLISHED");
  });

  it("forced + negated same event => CONTRADICTORY regardless of order", () => {
    const fwd = derive(makeCanon(), [forceEvent("ev/end"), negateEvent("ev/end")]);
    const rev = derive(makeCanon(), [negateEvent("ev/end"), forceEvent("ev/end")]);
    expect(s(fwd, "ev/end")).toBe("CONTRADICTORY");
    expect(s(rev, "ev/end")).toBe("CONTRADICTORY");
    // statuses and the content hash are order-independent; only the ordered
    // intervention chain (by design order-preserving) differs.
    expect(fwd.statuses).toEqual(rev.statuses);
    expect(fwd.hash).toBe(rev.hash);
  });
});

describe("EXCLUDES", () => {
  it("both endpoints established => both CONTRADICTORY + one record each", () => {
    const ws = derive(makeCanon(), []);
    expect(s(ws, "ev/team-a")).toBe("CONTRADICTORY");
    expect(s(ws, "ev/team-b")).toBe("CONTRADICTORY");
    expect(ws.contradictions.map((c) => c.id).sort()).toEqual([
      "contra:edge/team-excludes:excludes:ev/team-a",
      "contra:edge/team-excludes:excludes:ev/team-b",
    ]);
    for (const c of ws.contradictions) {
      expect(c.source).toBe("canon");
      expect(c.detectedAt).toMatch(/^ev\/team-[ab]$/);
    }
  });

  it("when one side is unsupported, no contradiction arises", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root2")]);
    expect(s(ws, "ev/team-a")).toBe("UNSUPPORTED");
    expect(s(ws, "ev/team-b")).toBe("UNSUPPORTED");
    expect(ws.contradictions).toHaveLength(0);
  });
});

describe("INVARIANT", () => {
  it("violated invariant => target CONTRADICTORY + one record", () => {
    // ev/doomed is normally UNSUPPORTED (its requirement ev/team-a is
    // contradictory). Forcing it makes it ESTABLISHED — which violates the
    // INVARIANT edge ev/root1 -> ev/doomed.
    const ws = derive(makeCanon(), [forceEvent("ev/doomed")]);
    expect(s(ws, "ev/root1")).toBe("ESTABLISHED");
    expect(s(ws, "ev/doomed")).toBe("CONTRADICTORY");
    expect(ws.contradictions).toContainEqual(
      expect.objectContaining({
        id: "contra:edge/invariant-doomed:invariant:ev/doomed",
        a: "ev/root1",
        b: "ev/doomed",
        detectedAt: "ev/doomed",
      })
    );
  });

  it("invariant holds when the target is not established", () => {
    const ws = derive(makeCanon(), []);
    expect(s(ws, "ev/doomed")).toBe("UNSUPPORTED"); // tainted by team-a
    expect(ws.contradictions.some((c) => c.id.includes("invariant"))).toBe(false);
  });
});

describe("ENABLES", () => {
  it("soft path with unresolved REQUIRES but open ENABLES => CONTINGENT", () => {
    const ws = derive(makeCanon(), []);
    expect(s(ws, "ev/soft")).toBe("CONTINGENT");
  });
});

describe("edge interventions", () => {
  it("severEdge frees a downstream event from its prerequisite", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root1"), severEdge("edge/child1-requires-root1")]);
    expect(s(ws, "ev/child1")).toBe("ESTABLISHED"); // no REQUIRES left => root
    expect(s(ws, "ev/grandchild")).toBe("ESTABLISHED"); // still requires child1
  });

  it("addEdge introduces a new hard requirement", () => {
    const extra: CausalEdge = { id: "edge/peer-requires-root1", kind: "REQUIRES", from: "ev/root1", to: "ev/peer" };
    const unaffected = derive(makeCanon(), [negateEvent("ev/root1")]);
    expect(s(unaffected, "ev/peer")).toBe("ESTABLISHED"); // peer only required root2

    const affected = derive(makeCanon(), [addEdge(extra), negateEvent("ev/root1")]);
    expect(s(affected, "ev/peer")).toBe("UNSUPPORTED"); // now also requires root1
  });
});

describe("determinism of the fixpoint", () => {
  it("sorted iteration makes the fixpoint order-independent", () => {
    const canon = makeCanon();
    const chain = [
      negateEvent("ev/root1"),
      forceEvent("ev/peer"),
      severEdge("edge/team-b-requires-root2"),
    ];
    const a = derive(canon, chain);
    const b = derive(canon, chain);
    expect(a.statuses).toEqual(b.statuses);
    expect(a.contradictions).toEqual(b.contradictions);
    expect(a.hash).toBe(b.hash);
  });

  it("remains deterministic for the contradictory branch", () => {
    const a = derive(makeCanon(), [forceEvent("ev/doomed")]);
    const b = derive(makeCanon(), [forceEvent("ev/doomed")]);
    expect(a).toEqual(b);
  });
});
