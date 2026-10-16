/**
 * Somnium Engine — the taint discipline, and the totality of conflict
 * classification (P-005, ncr-004).
 *
 * These two functions are exported ONLY so they can be pinned here. Neither is
 * fully reachable through `derive`, and that is exactly why they need direct
 * tests:
 *
 *   - `taintTruth`'s `NEITHER` branch is currently unreachable. The seventh L2
 *     gate made it throw and found 0 hits across 4,386 derivations, because the
 *     four world-level conflict kinds gate on `occursNow`/`forcedBy`, which
 *     decide a node before any conflict about it can fire. It is kept as a
 *     backstop for a future conflict kind whose predicate does not imply a
 *     decided node — so a test through `derive` would give it no coverage at all.
 *
 *   - The intervention/world classification is an ENUMERATION, which is the
 *     shape ncr-004 identifies as the recurring failure. It happens to be the
 *     right shape here (a note either is or is not about the intervention, which
 *     is a property of its kind), but an unclassified new kind would silently
 *     taint truth. The totality test below makes that a compile-and-test-time
 *     failure instead.
 */
import { describe, expect, it } from "vitest";
import { ABOUT_THE_INTERVENTION, ABOUT_THE_WORLD, taintTruth } from "./propagation";
import type { ConflictNote } from "./propagation";
import type { TruthValue } from "./judgment";

describe("taintTruth: a conflict may only contradict a DECIDED value", () => {
  it("leaves an undecided value undecided", () => {
    // The route-8 fix. The old expression was
    //   joinTruth(base, base === "TRUE" ? "FALSE" : "TRUE")
    // which for NEITHER evaluated joinTruth("NEITHER","TRUE") = TRUE — so a
    // conflict DECIDED an undecided node, promoting a dormant declared event to
    // ESTABLISHED and inflating occurrence counts.
    expect(taintTruth("NEITHER")).toBe("NEITHER");
  });

  it("contradicts a decided value", () => {
    expect(taintTruth("TRUE")).toBe("BOTH");
    expect(taintTruth("FALSE")).toBe("BOTH");
  });

  it("is idempotent on an already-contradictory value", () => {
    expect(taintTruth("BOTH")).toBe("BOTH");
  });

  it("never lowers information", () => {
    // Tainting must remain monotone in the information order, or P-003's
    // fixpoint argument breaks.
    const rank: Record<TruthValue, number> = { NEITHER: 0, TRUE: 1, FALSE: 1, BOTH: 2 };
    for (const base of ["NEITHER", "TRUE", "FALSE", "BOTH"] as TruthValue[]) {
      expect(rank[taintTruth(base)]).toBeGreaterThanOrEqual(rank[base]);
    }
  });

  it("is total over TruthValue", () => {
    for (const base of ["NEITHER", "TRUE", "FALSE", "BOTH"] as TruthValue[]) {
      expect(["NEITHER", "TRUE", "FALSE", "BOTH"]).toContain(taintTruth(base));
    }
  });
});

describe("every conflict kind is classified", () => {
  /**
   * The full union, written out. If a kind is added to `ConflictNote["kind"]`
   * without being added here, TypeScript fails on the `satisfies` check below;
   * if it is added here without being classified, the totality test fails.
   */
  const ALL_KINDS = [
    "forced-vs-negated",
    "forced-vs-refuted",
    "forced-undeclared",
    "fact-write-illegal",
    "excludes",
    "invariant",
  ] as const satisfies readonly ConflictNote["kind"][];

  it("the two classifications partition the kinds — no gaps", () => {
    // A gap is the dangerous direction: an unclassified kind falls through the
    // `ABOUT_THE_INTERVENTION` filter and taints truth.
    const unclassified = ALL_KINDS.filter(
      (kind) => !ABOUT_THE_INTERVENTION.has(kind) && !ABOUT_THE_WORLD.has(kind)
    );
    expect(unclassified).toEqual([]);
  });

  it("the two classifications partition the kinds — no overlaps", () => {
    const both = ALL_KINDS.filter(
      (kind) => ABOUT_THE_INTERVENTION.has(kind) && ABOUT_THE_WORLD.has(kind)
    );
    expect(both).toEqual([]);
  });

  it("both sets are exactly the kinds listed, and neither is empty", () => {
    // Guards against a vacuous pass: a set containing a kind that no longer
    // exists in the union would otherwise go unnoticed.
    expect([...ABOUT_THE_INTERVENTION].sort()).toEqual(
      ALL_KINDS.filter((k) => ABOUT_THE_INTERVENTION.has(k))
        .slice()
        .sort()
    );
    expect([...ABOUT_THE_WORLD].sort()).toEqual(
      ALL_KINDS.filter((k) => ABOUT_THE_WORLD.has(k))
        .slice()
        .sort()
    );
    expect(ABOUT_THE_INTERVENTION.size).toBeGreaterThan(0);
    expect(ABOUT_THE_WORLD.size).toBeGreaterThan(0);
  });

  it("classifies an incoherent INTERVENTION as records-only", () => {
    // These describe a caller asking for something the canon cannot express.
    // The world asserted nothing contradictory, so truth must not move.
    expect(ABOUT_THE_INTERVENTION.has("forced-undeclared")).toBe(true);
    expect(ABOUT_THE_INTERVENTION.has("fact-write-illegal")).toBe(true);
  });

  it("classifies an inconsistent WORLD as truth-tainting", () => {
    // These describe the world asserting P and not-P, which is what BOTH means.
    for (const kind of ["forced-vs-negated", "forced-vs-refuted", "excludes", "invariant"] as const) {
      expect(ABOUT_THE_WORLD.has(kind)).toBe(true);
    }
  });
});
