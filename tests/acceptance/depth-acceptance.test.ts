/**
 * Somnium Engine — P-002 acceptance suite: depth, divergence, chain experiments.
 *
 * Written BEFORE implementation. These tests define the observable contract for
 * the depth/divergence metrics and the chain-experiment runner. Do NOT modify
 * this file to make the implementation pass; fix the implementation.
 *
 * Key claims under test (docs/ARCHITECTURE-RECONNAISSANCE.md §8):
 *   - depth is NOT a count of interventions
 *   - a no-op chain has divergence 0 at any genealogical depth
 *   - one world-altering intervention out-scores five no-ops
 *   - depth N inherits the COMPLETE state of depth N-1
 */
import { describe, expect, it } from "vitest";
import { verrinCanon, verrinRewindPoint } from "../../src/canon/verrin";
import { derive } from "../../src/derive/world-state";
import { worldDiff } from "../../src/diff/diff";
import { computeDepth, computeDivergence } from "../../src/depth/depth";
import { runChain } from "../../src/experiment/runner";
import { statusOf, workStatusOf } from "../../src/query/status";
import { characterFact } from "../../src/query/query";
import { negateEvent, setFact, severEdge, relocate } from "../../src/timeline/types";

const canon = verrinCanon();
const rp = verrinRewindPoint();

const NO_BLIGHT = negateEvent("ev/blight-begins");
/** No-op: severs an edge that does not exist in the canon. */
const NOOP_1 = severEdge("edge/does-not-exist-1");
const NOOP_2 = severEdge("edge/does-not-exist-2");
const NOOP_3 = severEdge("edge/does-not-exist-3");
const NOOP_4 = severEdge("edge/does-not-exist-4");
const NOOP_5 = severEdge("edge/does-not-exist-5");

describe("divergence: structural, not bookkeeping", () => {
  it("a no-op chain of five interventions has divergence 0", () => {
    const baseline = derive(canon, []);
    const noops = derive(canon, [NOOP_1, NOOP_2, NOOP_3, NOOP_4, NOOP_5], rp);
    const d = computeDivergence(canon, baseline, noops, [NOOP_1, NOOP_2, NOOP_3, NOOP_4, NOOP_5]);

    expect(d.changedStatusCount).toBe(0);
    expect(d.changedFactCount).toBe(0);
    expect(d.impactedWorkCount).toBe(0);
    expect(d.graphDistance).toBe(0);
    expect(d.score).toBe(0);
  });

  it("one world-altering intervention out-scores five no-ops", () => {
    const baseline = derive(canon, []);
    const noops = derive(canon, [NOOP_1, NOOP_2, NOOP_3, NOOP_4, NOOP_5], rp);
    const altered = derive(canon, [NO_BLIGHT], rp);

    const noopScore = computeDivergence(canon, baseline, noops, [NOOP_1, NOOP_2, NOOP_3, NOOP_4, NOOP_5]).score;
    const alteredScore = computeDivergence(canon, baseline, altered, [NO_BLIGHT]).score;

    expect(alteredScore).toBeGreaterThan(noopScore);
    expect(alteredScore).toBeGreaterThan(0);
  });

  it("reports the structural components of the blight removal", () => {
    const baseline = derive(canon, []);
    const branch = derive(canon, [NO_BLIGHT], rp);
    const d = computeDivergence(canon, baseline, branch, [NO_BLIGHT]);

    expect(d.changedStatusCount).toBeGreaterThan(0);
    expect(d.changedFactCount).toBeGreaterThan(0);
    expect(d.impactedWorkCount).toBeGreaterThan(0);
    // the blight is the root of a multi-hop REQUIRES chain, so distance exceeds 1
    expect(d.graphDistance).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const baseline = derive(canon, []);
    const branch = derive(canon, [NO_BLIGHT], rp);
    const a = computeDivergence(canon, baseline, branch, [NO_BLIGHT]);
    const b = computeDivergence(canon, baseline, branch, [NO_BLIGHT]);
    expect(a).toEqual(b);
  });
});

describe("depth: genealogical vs structural", () => {
  it("separates genealogical depth from intervention count and divergence", () => {
    const baseline = derive(canon, []);
    const chain = [NO_BLIGHT, relocate("char/vara", "loc/stonehall")];
    const branch = derive(canon, chain, rp);
    const m = computeDepth(canon, baseline, branch, chain, 2);

    expect(m.genealogicalDepth).toBe(2);
    expect(m.interventionCount).toBe(2);
    expect(m.divergence.score).toBeGreaterThan(0);
  });

  it("five no-op generations have depth 5 but divergence 0 — depth is not a change measure", () => {
    const baseline = derive(canon, []);
    const chain = [NOOP_1, NOOP_2, NOOP_3, NOOP_4, NOOP_5];
    const branch = derive(canon, chain, rp);
    const m = computeDepth(canon, baseline, branch, chain, 5);

    expect(m.genealogicalDepth).toBe(5);
    expect(m.interventionCount).toBe(5);
    expect(m.divergence.score).toBe(0);
  });

  it("baseline has depth 0 and divergence 0 against itself", () => {
    const baseline = derive(canon, []);
    const m = computeDepth(canon, baseline, baseline, [], 0);
    expect(m.genealogicalDepth).toBe(0);
    expect(m.interventionCount).toBe(0);
    expect(m.divergence.score).toBe(0);
  });
});

describe("chain experiments: every intermediate state is inspectable", () => {
  const chain = [
    NO_BLIGHT, // depth 1: the cataclysm never happens
    setFact("char/vara", "located_in", "loc/thornhollow"), // depth 2: she goes anyway
    relocate("char/vara", "loc/stonehall"), // depth 3: and then moves on
  ];

  it("produces one run per depth, in order, with the baseline as depth 0", () => {
    const set = runChain(canon, rp, chain, "verrin-blight-chain");

    expect(set.canonId).toBe("canon/verrin");
    expect(set.runs.length).toBe(4); // depth 0 (baseline) + 3 interventions
    expect(set.runs.map((r) => r.depth.genealogicalDepth)).toEqual([0, 1, 2, 3]);
    expect(set.runs.map((r) => r.depth.interventionCount)).toEqual([0, 1, 2, 3]);
  });

  it("each depth carries the FULL intervention chain from baseline", () => {
    const set = runChain(canon, rp, chain, "verrin-blight-chain");
    expect(set.runs[1]?.interventions.map((i) => i.id)).toEqual([chain[0]?.id]);
    expect(set.runs[2]?.interventions.map((i) => i.id)).toEqual([chain[0]?.id, chain[1]?.id]);
    expect(set.runs[3]?.interventions.map((i) => i.id)).toEqual([chain[0]?.id, chain[1]?.id, chain[2]?.id]);
  });

  it("depth N inherits the complete state of depth N-1", () => {
    const set = runChain(canon, rp, chain, "verrin-blight-chain");
    // the depth-1 consequence (no blight => no exodus) survives at depth 2 and 3
    const d1 = derive(canon, chain.slice(0, 1), rp);
    const d2 = derive(canon, chain.slice(0, 2), rp);
    const d3 = derive(canon, chain.slice(0, 3), rp);

    expect(statusOf(d1, "ev/exodus")).toBe("UNSUPPORTED");
    expect(statusOf(d2, "ev/exodus")).toBe("UNSUPPORTED");
    expect(statusOf(d3, "ev/exodus")).toBe("UNSUPPORTED");
    expect(workStatusOf(d3, "work/verrin-ashfall")).toBe("IMPOSSIBLE");

    // and each depth's own consequence is layered on top
    expect(characterFact(d1, "char/vara", "located_in")?.object).toBe("loc/valdar");
    expect(characterFact(d2, "char/vara", "located_in")?.object).toBe("loc/thornhollow");
    expect(characterFact(d3, "char/vara", "located_in")?.object).toBe("loc/stonehall");

    // the runner's world hashes must match direct derivation (no divergent path)
    expect(set.runs[1]?.worldHash).toBe(d1.hash);
    expect(set.runs[2]?.worldHash).toBe(d2.hash);
    expect(set.runs[3]?.worldHash).toBe(d3.hash);
  });

  it("each run's diff is against the IMMEDIATE parent depth, not the baseline", () => {
    const set = runChain(canon, rp, chain, "verrin-blight-chain");
    const d1 = derive(canon, chain.slice(0, 1), rp);
    const d2 = derive(canon, chain.slice(0, 2), rp);
    const expected = worldDiff(d1, d2);
    expect(set.runs[2]?.diff.hash).toBe(expected.hash);
  });

  it("divergence is a distance from baseline, not a monotone accumulator", () => {
    const set = runChain(canon, rp, chain, "verrin-blight-chain");
    const scores = set.runs.map((r) => r.depth.divergence.score);
    expect(scores[0]).toBe(0); // baseline vs itself
    expect(scores[1]).toBeGreaterThan(0);
    expect(scores[2]).toBeGreaterThan(0);
    expect(scores[3]).toBeGreaterThan(0);
    // the depth-2 intervention restores Vara's canonical location
    // (loc/thornhollow), so the world moves BACK toward baseline.
    expect(scores[2] ?? 0).toBeLessThan(scores[1] ?? 0);
    // depth 3 moves her away again (loc/stonehall).
    expect(scores[3] ?? 0).toBeGreaterThan(scores[2] ?? 0);
    // Monotonicity is NOT a property of divergence: divergence is a structural
    // DISTANCE from the baseline world, so a later intervention that restores
    // a canonical value legitimately reduces it. What strictly increases along
    // a chain is genealogical depth (parent-chain length) — bookkeeping, not a
    // change measure.
  });

  it("is deterministic and replayable", () => {
    const a = runChain(canon, rp, chain, "verrin-blight-chain");
    const b = runChain(canon, rp, chain, "verrin-blight-chain");
    expect(a.runs.map((r) => r.worldHash)).toEqual(b.runs.map((r) => r.worldHash));
    expect(a.runs.map((r) => r.diff.hash)).toEqual(b.runs.map((r) => r.diff.hash));
    expect(a.runs.map((r) => r.depth)).toEqual(b.runs.map((r) => r.depth));
  });

  it("carries no statistical layer (deterministic engine: no replicates, no CI)", () => {
    const set = runChain(canon, rp, chain, "verrin-blight-chain");
    const run = set.runs[1] as unknown as Record<string, unknown>;
    expect(run["seed"]).toBeUndefined();
    expect(run["replicates"]).toBeUndefined();
    expect(run["ci95"]).toBeUndefined();
    expect(run["cohensD"]).toBeUndefined();
  });
});
