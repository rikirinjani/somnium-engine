/**
 * Somnium Engine — depth/divergence unit tests.
 *
 * Focused coverage for the structural divergence metrics and genealogical depth
 * (docs/ARCHITECTURE-RECONNAISSANCE.md §8). Uses the Verrin canon for real-world
 * shape plus small inline fixture canons to pin graphDistance on known-length
 * REQUIRES/ENABLES chains and the exact weighted-score arithmetic.
 */
import { describe, expect, it } from "vitest";
import { verrinCanon, verrinRewindPoint } from "../canon/verrin";
import { ADV_IDS, verrinAdversarialCanon } from "../canon/verrin-adversarial";
import { hashCanon } from "../canon/hash";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "../canon/types";
import { derive } from "../derive/world-state";
import { addEdge, forceEvent, negateEvent, relocate, retractFact, setFact, severEdge } from "../timeline/types";
import { computeDepth, computeDivergence } from "./depth";

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

// ---------------------------------------------------------------------------
// Fixture helpers — deterministic inline canons.
// ---------------------------------------------------------------------------

function makeCanon(
  canonId: string,
  entities: Entity[],
  facts: Fact[],
  edges: CausalEdge[],
  workBindings: WorkBinding[]
): Canon {
  const body = { canonId, version: "1.0.0", entities, facts, edges, workBindings };
  return { ...body, hash: hashCanon(body) };
}

const ev = (id: string): Entity => ({ id, kind: "Event", name: id });
const req = (id: string, from: string, to: string): CausalEdge => ({ id, kind: "REQUIRES", from, to });
const ena = (id: string, from: string, to: string): CausalEdge => ({ id, kind: "ENABLES", from, to });

// ---------------------------------------------------------------------------
// Fixture A: a plain 3-hop REQUIRES chain  ev/a -> ev/b -> ev/c -> ev/d.
// Negating the root ev/a gives EXCLUDED + three UNSUPPORTED, reach 3.
// ---------------------------------------------------------------------------
const CHAIN_A = makeCanon(
  "canon/chain-a",
  [ev("ev/a"), ev("ev/b"), ev("ev/c"), ev("ev/d")],
  [],
  [req("edge/r1", "ev/a", "ev/b"), req("edge/r2", "ev/b", "ev/c"), req("edge/r3", "ev/c", "ev/d")],
  []
);

// ---------------------------------------------------------------------------
// Fixture B: an ENABLES edge is the ONLY path from the source to a changed
// node. ev/l dead-loops through fact/fl (validFrom ev/l) so it is permanently
// UNKNOWN; ev/x REQUIRES ev/l (hard path unresolved) and is ENABLED by ev/a.
// Baseline: x CONTINGENT. Negate a => x UNSUPPORTED, reached only via ENABLES.
// ---------------------------------------------------------------------------
const FACT_FL: Fact = {
  id: "fact/fl",
  subject: "ev/l",
  predicate: "sealed",
  object: true,
  validFrom: "ev/l",
  validTo: null,
  source: "canon",
};
const CHAIN_B = makeCanon(
  "canon/chain-b",
  [ev("ev/a"), ev("ev/l"), ev("ev/x")],
  [FACT_FL],
  [req("edge/lr", "fact/fl", "ev/l"), req("edge/xr", "ev/l", "ev/x"), ena("edge/xe", "ev/a", "ev/x")],
  []
);

// ---------------------------------------------------------------------------
// Fixture C: chain A plus a leaf ev/d2 for addEdge reach extension.
// ---------------------------------------------------------------------------
const CHAIN_C = makeCanon(
  "canon/chain-c",
  [ev("ev/a"), ev("ev/b"), ev("ev/c"), ev("ev/d"), ev("ev/d2")],
  [],
  [req("edge/r1", "ev/a", "ev/b"), req("edge/r2", "ev/b", "ev/c"), req("edge/r3", "ev/c", "ev/d")],
  []
);

// ---------------------------------------------------------------------------
// Fixture D: a single canon fact, no graph — used to pin the 0.5 fact weight.
// ---------------------------------------------------------------------------
const FACT_F1: Fact = {
  id: "fact/f1",
  subject: "char/v",
  predicate: "located_in",
  object: "loc/a",
  validFrom: null,
  validTo: null,
  source: "canon",
};
const CANON_FACT = makeCanon("canon/fact-only", [], [FACT_F1], [], []);

// ---------------------------------------------------------------------------
// Verrin canon fixtures
// ---------------------------------------------------------------------------
const canon = verrinCanon();
const rp = verrinRewindPoint();
const NO_BLIGHT = negateEvent("ev/blight-begins");
const NOOP = (n: number) => severEdge(`edge/does-not-exist-${n}`);

describe("computeDivergence: no-op and baseline cases", () => {
  it("a chain of five no-op interventions scores zero on every component", () => {
    const noops = [NOOP(1), NOOP(2), NOOP(3), NOOP(4), NOOP(5)];
    const baseline = derive(canon, []);
    const branch = derive(canon, noops, rp);
    const d = computeDivergence(canon, baseline, branch, noops);

    expect(d.changedStatusCount).toBe(0);
    expect(d.changedStateCount).toBe(0);
    expect(d.changedFactCount).toBe(0);
    expect(d.impactedWorkCount).toBe(0);
    expect(d.graphDistance).toBe(0);
    expect(d.score).toBe(0);
  });

  it("baseline vs itself with no interventions is all zeros", () => {
    const baseline = derive(canon, []);
    const d = computeDivergence(canon, baseline, baseline, []);
    expect(d).toEqual({ changedStatusCount: 0, changedStateCount: 0, changedFactCount: 0, impactedWorkCount: 0, graphDistance: 0, score: 0 });
  });

  it("reports zero graphDistance when nothing changed even with a real graph", () => {
    // severing a real edge that both worlds share changes nothing in the diff
    const baseline = derive(CHAIN_A, []);
    const branch = derive(CHAIN_A, [severEdge("edge/r2")], rp);
    const d = computeDivergence(CHAIN_A, baseline, branch, [severEdge("edge/r2")]);
    expect(d.changedStatusCount).toBe(0);
    expect(d.changedStateCount).toBe(0);
    expect(d.graphDistance).toBe(0);
    expect(d.score).toBe(0);
  });
});

describe("computeDivergence: component counts on the Verrin blight removal", () => {
  it("reports the exact structural components of negating the blight", () => {
    const baseline = derive(canon, []);
    const branch = derive(canon, [NO_BLIGHT], rp);
    const d = computeDivergence(canon, baseline, branch, [NO_BLIGHT]);

    // the 11 events downstream of the blight (excluded root + 10 unsupported)
    expect(d.changedStatusCount).toBe(11);
    // value-aware state changes: loc/valdar|blanketed_by removed (ash never
    // falls), char/vara|affiliated_with added (academy never exoduses), and
    // char/vara|located_in differs (thornhollow -> valdar)
    expect(d.changedStateCount).toBe(3);
    // 2 removals (vara-in-thornhollow, ashfall-blankets-valdar lose their
    // validity windows) + 2 additions (vara-in-valdar, vara-academy-affiliation
    // survive because the exodus never happens)
    expect(d.changedFactCount).toBe(4);
    // all three canonical Works flip PRESERVED -> IMPOSSIBLE
    expect(d.impactedWorkCount).toBe(3);
    // blight -> kael-oath -> wardens-arrive -> treaty-of-ash -> valdar-rebuilds
    expect(d.graphDistance).toBe(4);
    // 11*1 + 3*1 + 4*0.5 + 3*2 + 4*1
    expect(d.score).toBe(26);
  });

  it("scores above any no-op chain", () => {
    const baseline = derive(canon, []);
    const noops = [NOOP(1), NOOP(2), NOOP(3), NOOP(4), NOOP(5)];
    const altered = derive(canon, [NO_BLIGHT], rp);
    const noopScore = computeDivergence(canon, baseline, derive(canon, noops, rp), noops).score;
    const alteredScore = computeDivergence(canon, baseline, altered, [NO_BLIGHT]).score;
    expect(alteredScore).toBeGreaterThan(noopScore);
  });
});

// ---------------------------------------------------------------------------
// The defect this field fixes: changedFactCount measures fact-RECORD churn by
// id and stays constant across three genuinely different worlds. The value-
// aware changedStateCount discriminates them because divergence is a DISTANCE
// from baseline, not a monotone accumulator: restoring a canonical value
// (depth 2 puts Vara back in loc/thornhollow, her baseline location) moves the
// world BACK toward baseline and legitimately lowers the score.
// ---------------------------------------------------------------------------
describe("computeDivergence: changedStateCount discriminates worlds the fact-churn count cannot", () => {
  const VERDIN_CHAIN = [
    NO_BLIGHT, // depth 1: the cataclysm never happens, Vara stays in valdar
    setFact("char/vara", "located_in", "loc/thornhollow"), // depth 2: she goes anyway — restores the canonical location
    relocate("char/vara", "loc/stonehall"), // depth 3: and then moves on
  ];

  it("regression guard: depth-2 divergence is strictly less than depth-1; all depths are > 0", () => {
    const baseline = derive(canon, []);
    const scores = VERDIN_CHAIN.map((_, i) => {
      const ivs = VERDIN_CHAIN.slice(0, i + 1);
      return computeDivergence(canon, baseline, derive(canon, ivs, rp), ivs);
    });

    // depth 1: 11*1 + 3*1 + 4*0.5 + 3*2 + 4*1 = 26
    expect(scores[0]?.score).toBe(26);
    // depth 2: Vara's located_in is back to the baseline value (thornhollow),
    // so changedStateCount drops 3 -> 2: 11*1 + 2*1 + 4*0.5 + 3*2 + 4*1 = 25
    expect(scores[1]?.score).toBe(25);
    // depth 3: Vara moves away again, changedStateCount is back to 3 = 26
    expect(scores[2]?.score).toBe(26);

    for (const s of scores) expect(s?.score).toBeGreaterThan(0);
    // THE regression guard: an intervention that restores a canonical value
    // moves the world BACK toward baseline, so divergence is not monotone.
    expect(scores[1]?.score ?? 0).toBeLessThan(scores[0]?.score ?? 0);
  });

  it("changedFactCount alone is insensitive at every depth while changedStateCount differs", () => {
    const baseline = derive(canon, []);
    const divs = VERDIN_CHAIN.map((_, i) => {
      const ivs = VERDIN_CHAIN.slice(0, i + 1);
      return computeDivergence(canon, baseline, derive(canon, ivs, rp), ivs);
    });

    // identical fact-record churn at all three depths: the depth-2 world still
    // logs add+remove for char/vara|located_in even though its VALUE equals
    // baseline — the id-keyed diff lane cannot see that the state was restored.
    expect(divs.map((d) => d.changedFactCount)).toEqual([4, 4, 4]);
    // value-aware state changes see the real picture: 3, then 2 (restored),
    // then 3 (moved away again).
    expect(divs.map((d) => d.changedStateCount)).toEqual([3, 2, 3]);
  });
});

describe("computeDivergence: graphDistance over a known-length REQUIRES chain", () => {
  it("negating the root of a 3-hop REQUIRES chain reaches distance 3", () => {
    const baseline = derive(CHAIN_A, []);
    const branch = derive(CHAIN_A, [negateEvent("ev/a")], rp);
    const d = computeDivergence(CHAIN_A, baseline, branch, [negateEvent("ev/a")]);

    expect(d.changedStatusCount).toBe(4); // a EXCLUDED, b/c/d UNSUPPORTED
    expect(d.changedStateCount).toBe(0); // no facts in this canon
    expect(d.changedFactCount).toBe(0);
    expect(d.impactedWorkCount).toBe(0);
    expect(d.graphDistance).toBe(3); // ev/a -> ev/b -> ev/c -> ev/d
    expect(d.score).toBe(7); // 4*1 + 0*1 + 0*0.5 + 0*2 + 3*1
  });

  it("counts ENABLES edges in the reach graph", () => {
    const baseline = derive(CHAIN_B, []);
    const branch = derive(CHAIN_B, [negateEvent("ev/a")], rp);
    const d = computeDivergence(CHAIN_B, baseline, branch, [negateEvent("ev/a")]);

    // only ev/a (EXCLUDED) and ev/x (CONTINGENT -> UNSUPPORTED) change
    expect(d.changedStatusCount).toBe(2);
    expect(d.changedStateCount).toBe(0); // fact/fl is effective in both worlds
    // ev/x is reached ONLY through the ENABLES edge ev/a -> ev/x
    expect(d.graphDistance).toBe(1);
    expect(d.score).toBe(3); // 2*1 + 0*1 + 0*0.5 + 0*2 + 1*1
  });

  it("does not seed BFS from intervention targets that are not graph nodes", () => {
    // retractFact targets a fact id that is not in the REQUIRES/ENABLES graph
    const baseline = derive(CANON_FACT, []);
    const branch = derive(CANON_FACT, [retractFact("fact/f1")], rp);
    const d = computeDivergence(CANON_FACT, baseline, branch, [retractFact("fact/f1")]);
    expect(d.changedStatusCount).toBe(0);
    // char/v|located_in is present in baseline but absent in the branch
    expect(d.changedStateCount).toBe(1);
    expect(d.changedFactCount).toBe(1);
    expect(d.graphDistance).toBe(0);
    expect(d.score).toBe(1.5); // 0*1 + 1*1 + 1*0.5 + 0*2 + 0*1
  });
});

// ---------------------------------------------------------------------------
// P-003 regression guards: graphDistance is a STRUCTURAL DISTANCE over the
// support graph, deliberately independent of truth. A node that is graph-
// connected to an intervention target contributes even when it does NOT
// execute — its status can be UNKNOWN (never established) or UNSUPPORTED
// (refuted). graphDistance is connectivity, not a claim about the world.
// Uses the adversarial canon (src/canon/verrin-adversarial.ts) for the
// ENABLES soft cycle (case E) and the REQUIRES blight chain (case A).
// ---------------------------------------------------------------------------
describe("computeDivergence: graphDistance is connectivity, not executability", () => {
  const adv = verrinAdversarialCanon();
  const { blight, exodus, ashfall } = ADV_IDS.A;
  const { softA, softB, groundA, groundB } = ADV_IDS.E;

  it("counts a graph-connected UNKNOWN node — connectivity without executability", () => {
    // Baseline FORCES soft-a, so soft-b's enabler occurs: soft-b is CONTINGENT
    // (truth NEITHER, soft support).
    const baseline = derive(adv, [forceEvent(softA)]);
    // Removing soft-a removes the ENABLES route. That never refutes a node (an
    // enabler is not a necessity): soft-b loses its soft support and returns to
    // UNKNOWN — truth NEITHER, i.e. it does NOT happen in this world.
    const branch = derive(adv, [negateEvent(softA)]);
    const d = computeDivergence(adv, baseline, branch, [negateEvent(softA)]);

    expect(branch.statuses[softB]).toBe("UNKNOWN"); // never established
    expect(branch.judgments[softB]?.truth).toBe("NEITHER"); // never executes
    // soft-a (EXCLUDED) and soft-b (UNKNOWN) both changed...
    expect(d.changedStatusCount).toBe(2);
    // ...and soft-b sits at distance 1 along the ENABLES edge soft-a -> soft-b.
    // Correct because the metric is a structural distance over the support
    // graph: the soft cycle case is a REQUIRES/ENABLES connection, and the
    // metric never asks whether the reached node has a derivation.
    expect(d.graphDistance).toBe(1);
    expect(d.score).toBe(3); // 2*1 + 0*1 + 0*0.5 + 0*2 + 1*1
  });

  it("counts graph-connected UNSUPPORTED nodes — distance, not truth", () => {
    const baseline = derive(adv, []);
    const branch = derive(adv, [negateEvent(blight)]);
    const d = computeDivergence(adv, baseline, branch, [negateEvent(blight)]);

    // blight EXCLUDED; its REQUIRES dependents cascade to UNSUPPORTED
    expect(branch.statuses[exodus]).toBe("UNSUPPORTED");
    expect(branch.statuses[ashfall]).toBe("UNSUPPORTED");
    // the grounded REQUIRES cycle loses its external support and goes UNKNOWN
    expect(branch.statuses[groundA]).toBe("UNKNOWN");
    expect(branch.statuses[groundB]).toBe("UNKNOWN");
    // blight + exodus + ashfall + vow + ground-a + ground-b
    expect(d.changedStatusCount).toBe(6);
    // The maximum distance 2 is attained by ashfall (UNSUPPORTED) at
    // blight -> exodus -> ashfall — and equally by ground-b (UNKNOWN) around
    // the grounded cycle. Both count: graphDistance measures graph connectivity
    // and is deliberately silent on whether any reached node actually happens.
    expect(d.graphDistance).toBe(2);
    expect(d.score).toBe(12); // 6*1 + 1*1 + 2*0.5 + 1*2 + 2*1
  });
});

describe("computeDivergence: severEdge / addEdge reshape the reach graph", () => {
  it("an added REQUIRES edge extends graphDistance past the original chain", () => {
    const added = addEdge(req("edge/r4", "ev/d", "ev/d2"));
    const branchInterventions = [added, negateEvent("ev/a")];
    const baseline = derive(CHAIN_C, []);
    const branch = derive(CHAIN_C, branchInterventions, rp);

    const d = computeDivergence(CHAIN_C, baseline, branch, branchInterventions);
    expect(d.changedStatusCount).toBe(5); // a,b,c,d + the new leaf ev/d2
    expect(d.graphDistance).toBe(4); // a -> b -> c -> d -> d2

    // control: without the added edge the same negation reaches only 3
    const control = computeDivergence(CHAIN_C, baseline, derive(CHAIN_C, [negateEvent("ev/a")], rp), [negateEvent("ev/a")]);
    expect(control.graphDistance).toBe(3);
  });

  it("a severed REQUIRES edge removes the downstream reach entirely", () => {
    const branchInterventions = [severEdge("edge/r1"), negateEvent("ev/a")];
    const baseline = derive(CHAIN_C, []);
    const branch = derive(CHAIN_C, branchInterventions, rp);

    const d = computeDivergence(CHAIN_C, baseline, branch, branchInterventions);
    // b/c/d are now roots: only ev/a itself changes
    expect(d.changedStatusCount).toBe(1);
    expect(d.graphDistance).toBe(0);

    // control: without the sever the same negation changes all four nodes
    const control = computeDivergence(CHAIN_C, baseline, derive(CHAIN_C, [negateEvent("ev/a")], rp), [negateEvent("ev/a")]);
    expect(control.changedStatusCount).toBe(4);
    expect(control.graphDistance).toBe(3);
  });
});

describe("computeDivergence: determinism", () => {
  it("produces byte-identical results across repeated calls", () => {
    const baseline = derive(canon, []);
    const branch = derive(canon, [NO_BLIGHT], rp);
    const a = computeDivergence(canon, baseline, branch, [NO_BLIGHT]);
    const b = computeDivergence(canon, baseline, branch, [NO_BLIGHT]);

    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is deterministic on a fixture with a multi-hop reach and severing", () => {
    const branchInterventions = [severEdge("edge/r2"), negateEvent("ev/a")];
    const baseline = derive(CHAIN_A, []);
    const branch = derive(CHAIN_A, branchInterventions, rp);
    const a = computeDivergence(CHAIN_A, baseline, branch, branchInterventions);
    const b = computeDivergence(CHAIN_A, baseline, branch, branchInterventions);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("computeDepth: genealogical vs structural", () => {
  it("passes through genealogicalDepth and interventionCount and delegates divergence", () => {
    const chain = [NOOP(1), NOOP(2)];
    const baseline = derive(canon, []);
    const branch = derive(canon, chain, rp);
    const m = computeDepth(canon, baseline, branch, chain, 5);

    expect(m.genealogicalDepth).toBe(5);
    expect(m.interventionCount).toBe(2);
    expect(m.divergence).toEqual(computeDivergence(canon, baseline, branch, chain));
  });

  it("separates a five-generation no-op chain (depth 5) from divergence 0", () => {
    const chain = [NOOP(1), NOOP(2), NOOP(3), NOOP(4), NOOP(5)];
    const baseline = derive(canon, []);
    const branch = derive(canon, chain, rp);
    const m = computeDepth(canon, baseline, branch, chain, 5);

    expect(m.genealogicalDepth).toBe(5);
    expect(m.interventionCount).toBe(5);
    expect(m.divergence.score).toBe(0);
  });

  it("ranks a single world-altering intervention above five no-ops", () => {
    const chain = [NOOP(1), NOOP(2), NOOP(3), NOOP(4), NOOP(5)];
    const baseline = derive(canon, []);
    const noopBranch = derive(canon, chain, rp);
    const alteredBranch = derive(canon, [NO_BLIGHT], rp);

    const noop = computeDepth(canon, baseline, noopBranch, chain, 5);
    const altered = computeDepth(canon, baseline, alteredBranch, [NO_BLIGHT], 1);
    expect(altered.divergence.score).toBeGreaterThan(noop.divergence.score);
    expect(altered.divergence.score).toBeGreaterThan(0);
  });
});
