/**
 * Somnium Engine — PoC acceptance suite (the executable contract).
 *
 * Written BEFORE the engine implementation exists. These tests define the
 * observable behaviour the fixer lanes must satisfy. Do NOT modify this file
 * to make the engine pass; modify the engine.
 *
 * Seed universe: "Verrin" (tiny invented canon — no copyright/canon ambiguity).
 */
import { describe, expect, it } from "vitest";
import { verrinCanon, verrinRewindPoint } from "../../src/canon/verrin";
import { hashCanon, hashState } from "../../src/canon/hash";
import { derive, type WorldState } from "../../src/derive/world-state";
import { statusOf, workStatusOf } from "../../src/query/status";
import { characterFact, reachable } from "../../src/query/query";
import { worldDiff } from "../../src/diff/diff";
import { validateRewindPoint } from "../../src/timeline/rewind-point";
import { createUniverse, branchUniverse, lineageOf } from "../../src/timeline/universe";
import { negateEvent, forceEvent, setFact } from "../../src/timeline/types";

const canon = verrinCanon();
const rp = verrinRewindPoint();

const NO_BLIGHT = negateEvent("ev/blight-begins");

describe("capability 1+8: baseline canon + content hashing", () => {
  it("canon loads, is content-hashed, and hashing is deterministic", () => {
    expect(canon.canonId).toBe("canon/verrin");
    expect(canon.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(canon.hash).toBe(hashCanon(canon));
    expect(hashCanon(canon)).toBe(hashCanon(canon)); // deterministic
    expect(hashState({ b: 1, a: 2 })).toBe(hashState({ a: 2, b: 1 })); // key-order independent
  });

  it("canon is structurally complete", () => {
    expect(canon.entities.length).toBeGreaterThanOrEqual(12);
    expect(canon.facts.length).toBeGreaterThan(0);
    expect(canon.edges.length).toBeGreaterThan(0);
    expect(canon.workBindings.length).toBeGreaterThanOrEqual(1);
  });
});

describe("capability 2: one rewind point", () => {
  it("RP-VERRIN-001 anchors at the Blight and validates against canon", () => {
    expect(rp.id).toBe("RP-VERRIN-001");
    expect(rp.anchorEvent).toBe("ev/blight-begins");
    expect(rp.canonId).toBe("canon/verrin");
    const v = validateRewindPoint(rp, canon);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("tampered rewind point fails validation (integrity)", () => {
    const tampered = { ...rp, derivedHash: "deadbeef" };
    expect(validateRewindPoint(tampered, canon).ok).toBe(false);
  });
});

describe("capability 3+4: one intervention + causal propagation", () => {
  it("baseline: the Blight happens, exodus happens", () => {
    const base = derive(canon, []);
    expect(statusOf(base, "ev/blight-begins")).toBe("ESTABLISHED");
    expect(statusOf(base, "ev/exodus")).toBe("ESTABLISHED");
  });

  it("do(blight never happens): exodus and downstream become UNSUPPORTED", () => {
    const u001 = derive(canon, [NO_BLIGHT], rp);
    expect(statusOf(u001, "ev/blight-begins")).toBe("EXCLUDED");
    expect(statusOf(u001, "ev/exodus")).toBe("UNSUPPORTED"); // direct REQUIRES
    expect(statusOf(u001, "ev/ashfall-falls")).toBe("UNSUPPORTED"); // transitive
    expect(reachable(u001, "ev/exodus")).toBe(false);
  });
});

describe("capability 5: changed character state", () => {
  it("Vara flees in baseline but stays in Valdar when the Blight is removed", () => {
    const base = derive(canon, []);
    const u001 = derive(canon, [NO_BLIGHT], rp);
    // baseline: exodus occurred => Vara's located_in flips to Thornhollow
    expect(characterFact(base, "char/vara", "located_in")?.object).toBe("loc/thornhollow");
    // branch: exodus unsupported => her located_in stays Valdar
    expect(characterFact(u001, "char/vara", "located_in")?.object).toBe("loc/valdar");
  });
});

describe("capability 6: changed event reachability", () => {
  it("a canonical Work becomes IMPOSSIBLE in the branch", () => {
    const base = derive(canon, []);
    const u001 = derive(canon, [NO_BLIGHT], rp);
    expect(workStatusOf(base, "work/verrin-ashfall")).toBe("PRESERVED");
    expect(workStatusOf(u001, "work/verrin-ashfall")).toBe("IMPOSSIBLE");
  });

  it("another Work remains PRESERVED when untouched", () => {
    const u001 = derive(canon, [NO_BLIGHT], rp);
    expect(workStatusOf(u001, "work/ember-prelude")).toBe("IMPOSSIBLE");
  });
});

describe("capability 7: branch genealogy", () => {
  it("builds a U-BASELINE -> U-001 -> U-002 lineage with ancestry", () => {
    const baseline = createUniverse({ canonId: canon.canonId, label: "U-BASELINE" });
    const u001 = branchUniverse(baseline, rp, [NO_BLIGHT], "U-001");
    // branchUniverse takes the NEW step; the child carries the full parent chain.
    const u002 = branchUniverse(u001, rp, [setFact("char/vara", "located_in", "loc/thornhollow")], "U-002");

    expect(u001.parent).toBe(baseline.id);
    expect(u002.parent).toBe(u001.id);
    expect(lineageOf(u002)).toEqual([u002.id, u001.id, baseline.id]);
    expect(u002.interventions.length).toBe(2); // full chain carried
  });
});

describe("capability 8: world diff", () => {
  it("produces structural status/fact/work diffs, not just numbers", () => {
    const base = derive(canon, []);
    const u001 = derive(canon, [NO_BLIGHT], rp);
    const d = worldDiff(base, u001);

    expect(d.statusChanges.some((c) => c.entityId === "ev/blight-begins" && c.to === "EXCLUDED")).toBe(true);
    expect(d.statusChanges.some((c) => c.entityId === "ev/exodus" && c.to === "UNSUPPORTED")).toBe(true);
    expect(d.factRemovals.length).toBeGreaterThan(0); // exodus-established facts vanish
    expect(d.workStatusChanges.some((w) => w.workId === "work/verrin-ashfall" && w.to === "IMPOSSIBLE")).toBe(true);
    expect(d.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("surfaces contradictions instead of silently fixing them", () => {
    const contradicting = derive(canon, [forceEvent("ev/exodus"), NO_BLIGHT], rp);
    expect(statusOf(contradicting, "ev/exodus")).toBe("CONTRADICTORY");
    expect(contradicting.contradictions.length).toBeGreaterThan(0);
  });
});

describe("capability 9: multi-depth intervention", () => {
  it("depth-2 intervenes inside the depth-1 world and inherits its state", () => {
    const u002 = derive(canon, [NO_BLIGHT, setFact("char/vara", "located_in", "loc/thornhollow")], rp);
    // inherits depth-1 consequence
    expect(statusOf(u002, "ev/exodus")).toBe("UNSUPPORTED");
    // depth-2 consequence layered on top
    expect(characterFact(u002, "char/vara", "located_in")?.object).toBe("loc/thornhollow");
  });
});

describe("capability 10: deterministic replay", () => {
  it("same canon + same interventions => identical WorldState", () => {
    const a = derive(canon, [NO_BLIGHT], rp);
    const b = derive(canon, [NO_BLIGHT], rp);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.statuses).toEqual(b.statuses);
    expect(a.facts).toEqual(b.facts);
    expect((a as WorldState).canonId).toBe("canon/verrin");
  });
});
