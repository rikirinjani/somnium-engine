/**
 * S023 — Unfounded-Set Non-Empty / Candidate Sufficiency.
 *
 * Exercise |U| > 0 with synthetic canons, and test whether every Phase-B
 * consequence lies inside the changed NEITHER/candidate frontier ΔC.
 *
 * Observation only: `observeUnfoundedSet` wraps the authoritative `unfoundedSet`.
 */
import type { Canon } from "../../src/canon/types";
import { buildModel, observeUnfoundedSet, propagationTruth } from "../../src/derive/propagation";
import { derive } from "../../src/derive/world-state";
import { canonicalJson } from "../../src/canon/hash";
import { type Intervention, forceEvent, addEdge, severEdge, negateEvent } from "../../src/timeline/types";

function ev(id: string) {
  return { id, kind: "Event" as const, name: id };
}
function req(id: string, from: string, to: string) {
  return { id, kind: "REQUIRES" as const, from, to };
}

/** A: pure bootstrap 2-cycle, no external support */
function canonA(): Canon {
  return {
    canonId: "canon/s023-a",
    version: "1.0.0",
    entities: [ev("ev/a"), ev("ev/b")],
    facts: [],
    edges: [req("e/a-req-b", "ev/b", "ev/a"), req("e/b-req-a", "ev/a", "ev/b")],
    workBindings: [],
    hash: "",
  };
}

/** B: larger bootstrap 3-cycle */
function canonB(): Canon {
  return {
    canonId: "canon/s023-b",
    version: "1.0.0",
    entities: [ev("ev/a"), ev("ev/b"), ev("ev/c")],
    facts: [],
    edges: [req("e/a-req-b", "ev/b", "ev/a"), req("e/b-req-c", "ev/c", "ev/b"), req("e/c-req-a", "ev/a", "ev/c")],
    workBindings: [],
    hash: "",
  };
}

/** C/F: two SCCs; SCC-1 unsupported, SCC-2 externally supported; a bridge depends on both */
function canonCF(): Canon {
  return {
    canonId: "canon/s023-cf",
    version: "1.0.0",
    entities: [ev("ev/a"), ev("ev/b"), ev("ev/c"), ev("ev/d"), ev("ev/g"), ev("ev/h"), ev("ev/bridge")],
    facts: [],
    edges: [
      // SCC-1: a <-> b (unsupported)
      req("e/a-req-b", "ev/b", "ev/a"),
      req("e/b-req-a", "ev/a", "ev/b"),
      // SCC-2: c <-> d, with external support g
      req("e/c-req-d", "ev/d", "ev/c"),
      req("e/d-req-c", "ev/c", "ev/d"),
      req("e/c-req-g", "ev/g", "ev/c"),
      // bridge requires a (SCC-1) and c (SCC-2)
      req("e/bridge-req-a", "ev/a", "ev/bridge"),
      req("e/bridge-req-c", "ev/c", "ev/bridge"),
    ],
    workBindings: [],
    hash: "",
  };
}

interface StepObs {
  cand: string[];
  unf: string[];
  truth: Record<string, string>;
  judgments: Record<string, unknown>;
}

function observe(canon: Canon, H: Intervention[]): StepObs {
  const model = buildModel(canon, H);
  const t = propagationTruth(model);
  const obs = observeUnfoundedSet(model); // computes Phase-A candidates itself
  const truth: Record<string, string> = {};
  for (const n of model.nodeIds) truth[n] = t.get(n) ?? "NEITHER";
  return { cand: obs.candidates, unf: obs.unfounded, truth, judgments: derive(canon, H).judgments as Record<string, unknown> };
}

function delta(prev: string[], cur: string[]): number {
  const a = new Set(prev);
  const b = new Set(cur);
  let d = 0;
  for (const x of a) if (!b.has(x)) d++;
  for (const x of b) if (!a.has(x)) d++;
  return d;
}

function semanticDelta(a: Record<string, unknown>, b: Record<string, unknown>): number {
  let d = 0;
  for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) if (canonicalJson(a[n]) !== canonicalJson(b[n])) d++;
  return d;
}

console.log("=== S023 — unfounded witnesses + candidate sufficiency ===\n");

const cases: [string, Canon, Intervention[]][] = [
  ["A: bootstrap 2-cycle", canonA(), []],
  ["B: bootstrap 3-cycle", canonB(), []],
  ["C/F: SCC1 unsupported + SCC2 supported + bridge", canonCF(), []],
  ["D: external-support gain (add REQUIRES g->a)", canonA(), [addEdge(req("e/g-sup-a", "ev/g", "ev/a"), "s")]],
  ["E: external-support loss (sever b<-a in 2-cycle)", canonA(), [severEdge("e/b-req-a", "s")]],
  ["F+: force a in 2-cycle (external ground)", canonA(), [forceEvent("ev/a", "s")]],
];

for (const [name, canon, H] of cases) {
  const base = observe(canon, []);
  const cur = observe(canon, H);
  const dC = delta(base.cand, cur.cand);
  const dU = delta(base.unf, cur.unf);
  const dSem = semanticDelta(base.judgments, cur.judgments);
  const outside = cur.unf.filter((n) => !cur.cand.includes(n));
  console.log(`--- ${name}`);
  console.log(`   |C|=${cur.cand.length} dC=${dC}  |U|=${cur.unf.length} dU=${dU}  dSem=${dSem}`);
  console.log(`   C=[${cur.cand.join(",")}]  U=[${cur.unf.join(",")}]`);
  console.log(`   U\\C=${outside.length}  truth={${Object.entries(cur.truth).map(([k, v]) => `${k}:${v}`).join(",")}}`);
}

// Cross-SCC cascade: does removing SCC-1's membership propagate outside ΔC?
console.log("\n=== cross-SCC cascade (canon C/F) ===");
{
  const canon = canonCF();
  const steps: Intervention[] = [];
  let prev = observe(canon, steps);
  console.log(`  step 0  |C|=${prev.cand.length} dC=- |U|=${prev.unf.length} C=[${prev.cand.join(",")}] U=[${prev.unf.join(",")}]`);
  const ivs: Intervention[] = [
    forceEvent("ev/g", "s"), // external support already root; try severing SCC-2 external
    severEdge("e/c-req-g", "s"),
    severEdge("e/b-req-a", "s"),
  ];
  for (let i = 0; i < ivs.length; i++) {
    steps.push(ivs[i]!);
    const cur = observe(canon, steps);
    const dC = delta(prev.cand, cur.cand);
    const dU = delta(prev.unf, cur.unf);
    const changedOutsideC = cur.cand.filter((n) => prev.cand.includes(n) && prev.unf.includes(n) !== cur.unf.includes(n));
    console.log(
      `  step ${i + 1}  iv=${ivs[i]!.kind}:${ivs[i]!.target} |C|=${cur.cand.length} dC=${dC} |U|=${cur.unf.length} dU=${dU} ` +
        `C=[${cur.cand.join(",")}] U=[${cur.unf.join(",")}] U-flips-outside-dC=${changedOutsideC.length}`
    );
    prev = cur;
  }
}

void negateEvent;
