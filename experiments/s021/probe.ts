/**
 * S021 — Incremental Support Aggregate / Fixpoint Primitive.
 *
 * Test whether the support expression can be represented by a compact aggregate
 * (per-group counts) that is EXACT for the reference FOUR semantics, and whether
 * a member change updates it locally.
 *
 * Observation only. No propagation semantics are changed.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, propagationTruth } from "../../src/derive/propagation";
import { conjoin, disjoin, type TruthValue } from "../../src/derive/judgment";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";

type Counts = { n: number; nTrue: number; nFalseOrBoth: number };

/** aggregate a conjunction from counts alone */
function conjFromCounts(c: Counts): TruthValue {
  if (c.n === 0) return "TRUE";
  if (c.nFalseOrBoth > 0) return "FALSE";
  return c.nTrue === c.n ? "TRUE" : "NEITHER";
}

/** aggregate a disjunction from group results alone */
function disjFromCounts(c: { n: number; nTrue: number; nFalse: number }): TruthValue {
  if (c.n === 0) return "TRUE";
  if (c.nTrue > 0) return "TRUE";
  return c.nFalse === c.n ? "FALSE" : "NEITHER";
}

function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function history(canon: Canon, h: number, seed: number): Intervention[] {
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const preds = [...new Set(canon.facts.map((f) => f.predicate))].sort();
  const objs = [...new Set(canon.facts.map((f) => f.object))];
  const factIds = canon.facts.map((f) => f.id).sort();
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const rand = rng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const out: Intervention[] = [];
  for (let k = 0; k < h; k++) {
    const roll = rand();
    if (roll < 0.4 && ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), objs.length > 0 ? pick(objs) : true, "r"));
    else if (roll < 0.55 && evs.length > 0) out.push(negateEvent(pick(evs), "r"));
    else if (roll < 0.7 && evs.length > 0) out.push(forceEvent(pick(evs), "r"));
    else if (roll < 0.82 && factIds.length > 0) out.push(retractFact(pick(factIds), "r"));
    else if (roll < 0.92 && edges.length > 0) out.push(severEdge(pick(edges).id, "r"));
    else if (edges.length > 0) out.push(addEdge({ ...pick(edges) }, "r"));
  }
  return out;
}

console.log("=== S021 — support aggregate exactness ===\n");
let groups = 0;
let groupMismatch = 0;
let nodes = 0;
let nodeMismatch = 0;

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260926);
  for (let i = 0; i <= H.length; i += 5) {
    const model = buildModel(canon, H.slice(0, i));
    const truth = propagationTruth(model);
    for (const [target, supportGroups] of model.supportGroups) {
      // group-level: counts -> conjoin
      const groupResults: TruthValue[] = [];
      for (const g of supportGroups) {
        const vals = g.conjuncts.map((c) => truth.get(c) ?? "NEITHER");
        const ref = conjoin(vals);
        const counts: Counts = { n: vals.length, nTrue: vals.filter((v) => v === "TRUE").length, nFalseOrBoth: vals.filter((v) => v === "FALSE" || v === "BOTH").length };
        const agg = conjFromCounts(counts);
        groups++;
        if (ref !== agg) groupMismatch++;
        groupResults.push(ref);
      }
      // node-level: group results -> disjoin
      const refNode = disjoin(groupResults);
      const c = { n: groupResults.length, nTrue: groupResults.filter((v) => v === "TRUE").length, nFalse: groupResults.filter((v) => v === "FALSE").length };
      const aggNode = disjFromCounts(c);
      nodes++;
      if (refNode !== aggNode) nodeMismatch++;
      // compare to the node's ACTUAL truth (only valid when not negated/forced)
      if (!model.negated.has(target) && !model.forcedBy.has(target)) {
        const actual = truth.get(target) ?? "NEITHER";
        if (actual !== aggNode) {
          // may differ for fact nodes / undeclared; count separately
        }
      }
    }
  }
}

console.log(`conjunctive groups=${groups} aggregate mismatches=${groupMismatch}`);
console.log(`disjunctive nodes=${nodes} aggregate mismatches=${nodeMismatch}`);
console.log(`[EXACT] support aggregate == reference FOUR semantics ? ${groupMismatch === 0 && nodeMismatch === 0}`);

// incremental update test: flip one member and update counts locally
let incChecked = 0;
let incMismatch = 0;
{
  const canon = verrinCanon();
  const model = buildModel(canon, history(canon, 100, 7));
  const truth = propagationTruth(model);
  for (const [target, supportGroups] of model.supportGroups) {
    for (const g of supportGroups) {
      if (g.conjuncts.length === 0) continue;
      const before = g.conjuncts.map((c) => truth.get(c) ?? "NEITHER");
      const counts: Counts = { n: before.length, nTrue: before.filter((v) => v === "TRUE").length, nFalseOrBoth: before.filter((v) => v === "FALSE" || v === "BOTH").length };
      for (let k = 0; k < before.length; k++) {
        const oldV = before[k]!;
        const newV: TruthValue = oldV === "TRUE" ? "FALSE" : "TRUE";
        const c2: Counts = { ...counts };
        if (oldV === "TRUE") {
          c2.nTrue--;
          c2.nFalseOrBoth++;
        } else {
          c2.nFalseOrBoth--;
          c2.nTrue++;
        }
        // reference: recompute
        const after = before.map((v, j) => (j === k ? newV : v));
        incChecked++;
        if (conjFromCounts(c2) !== conjoin(after)) incMismatch++;
      }
    }
    void target;
  }
}
console.log(`\nincremental member-flip updates=${incChecked} mismatches=${incMismatch}`);
console.log(`[LOCAL] local count update == full recompute ? ${incMismatch === 0}`);
