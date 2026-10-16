/**
 * S024 — Randomized SCC / OR-Support Boundary Stress.
 *
 * Generate 100 random 5–20-node topologies with cycles and genuine OR groups,
 * exercise support-affecting transitions, and test the invariant:
 *   U ⊆ C ,  ΔU ⊆ ΔC ,  PhaseBOnlyDelta ⊆ ΔC
 *
 * Observation only: `observeUnfoundedSet` wraps the authoritative unfoundedSet.
 */
import type { Canon, CausalEdge } from "../../src/canon/types";
import { buildModel, observeUnfoundedSet, propagationTruth } from "../../src/derive/propagation";
import { derive } from "../../src/derive/world-state";
import { canonicalJson } from "../../src/canon/hash";
import {
  type Intervention,
  forceEvent,
  negateEvent,
  addEdge,
  severEdge,
} from "../../src/timeline/types";

function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Gen {
  canon: Canon;
  hasSCC: boolean;
  hasUnsupportedSCC: boolean;
  hasOR: boolean;
  hasSupportedSCC: boolean;
}

/** Random 5–20 node canon biased toward cycles and OR groups. */
function generate(seed: number): Gen {
  const rand = rng(seed);
  const n = 5 + Math.floor(rand() * 16);
  const entities = Array.from({ length: n }, (_, i) => ({ id: `ev/n${i}`, kind: "Event" as const, name: `n${i}` }));
  const edges: CausalEdge[] = [];
  let eid = 0;
  const req = (from: string, to: string, group?: string): void => {
    edges.push({ id: `e${eid++}`, kind: "REQUIRES", from, to, ...(group !== undefined ? { group } : {}) });
  };
  let hasOR = false;
  // random edges
  const m = 4 + Math.floor(rand() * (n * 1.5));
  for (let k = 0; k < m; k++) {
    const a = `ev/n${Math.floor(rand() * n)}`;
    const b = `ev/n${Math.floor(rand() * n)}`;
    if (a === b) continue;
    req(a, b);
  }
  // force at least one 2-cycle on ~half the seeds
  if (rand() < 0.6 && n >= 2) {
    req("ev/n0", "ev/n1");
    req("ev/n1", "ev/n0");
  }
  // force a genuine OR group: (n2 AND n3) OR n4 -> n5
  if (rand() < 0.5 && n >= 6) {
    req("ev/n2", "ev/n5", "0");
    req("ev/n3", "ev/n5", "0");
    req("ev/n4", "ev/n5", "1");
    hasOR = true;
  }
  return { canon: { canonId: `canon/s024-${seed}`, version: "1.0.0", entities, facts: [], edges, workBindings: [], hash: "" }, hasSCC: false, hasUnsupportedSCC: false, hasOR, hasSupportedSCC: false };
}

function observe(canon: Canon, H: Intervention[]) {
  const model = buildModel(canon, H);
  const obs = observeUnfoundedSet(model);
  const j = derive(canon, H).judgments as Record<string, unknown>;
  return { cand: obs.candidates, unf: obs.unfounded, judgments: j, nodes: model.nodeIds };
}

function setDiff(a: string[], b: string[]): string[] {
  const B = new Set(b);
  return a.filter((x) => !B.has(x));
}
function symDiff(a: string[], b: string[]): string[] {
  const A = new Set(a);
  const B = new Set(b);
  return [...a.filter((x) => !B.has(x)), ...b.filter((x) => !A.has(x))];
}

const N_TOPOS = 100;
let toposWithU = 0;
let toposWithOR = 0;
let transitions = 0;
let uSubC = 0;
let dUsubdC = 0;
let phaseBSubdC = 0;
const failures: { seed: number; kind: string; detail: string }[] = [];

for (let seed = 1; seed <= N_TOPOS; seed++) {
  const g = generate(seed);
  const canon = g.canon;
  const base = observe(canon, []);
  if (base.unf.length > 0) toposWithU++;
  if (g.hasOR) toposWithOR++;

  // transitions: force a root, negate a node, add/sever a random edge
  const ivs: Intervention[] = [];
  const n0 = canon.entities[0]!.id;
  const n1 = canon.entities[1]!.id;
  ivs.push(forceEvent(n0, "s"));
  ivs.push(negateEvent(n1, "s"));
  if (canon.edges.length > 0) ivs.push(severEdge(canon.edges[0]!.id, "s"));
  ivs.push(addEdge({ id: "e/new", kind: "REQUIRES", from: n0, to: n1 }, "s"));
  ivs.push(forceEvent(canon.entities[Math.min(4, canon.entities.length - 1)]!.id, "s"));

  let prev = base;
  let steps: Intervention[] = [];
  for (const iv of ivs) {
    steps = [...steps, iv];
    const cur = observe(canon, steps);
    transitions++;

    // U ⊆ C
    if (setDiff(cur.unf, cur.cand).length === 0) uSubC++;
    else failures.push({ seed, kind: "U⊄C", detail: `U\\C=[${setDiff(cur.unf, cur.cand).join(",")}]` });

    // ΔU ⊆ ΔC  (interpreted as: every unfounded-membership change is a candidate-membership change)
    const dU = symDiff(prev.unf, cur.unf);
    const dC = symDiff(prev.cand, cur.cand);
    if (setDiff(dU, dC).length === 0) dUsubdC++;
    else failures.push({ seed, kind: "ΔU⊄ΔC", detail: `dU\\dC=[${setDiff(dU, dC).join(",")}] iv=${iv.kind}` });

    // PhaseBOnlyDelta: judgment changes among unfounded nodes
    const changed = new Set<string>();
    for (const nn of new Set([...Object.keys(prev.judgments), ...Object.keys(cur.judgments)])) {
      if (canonicalJson(prev.judgments[nn]) !== canonicalJson(cur.judgments[nn])) changed.add(nn);
    }
    const pb = [...changed].filter((nn) => cur.unf.includes(nn) || prev.unf.includes(nn));
    if (setDiff(pb, dC).length === 0) phaseBSubdC++;
    else failures.push({ seed, kind: "PhaseBOnly⊄ΔC", detail: `pb\\dC=[${setDiff(pb, dC).join(",")}] iv=${iv.kind}` });

    prev = cur;
  }
}

console.log("=== S024 — randomized SCC / OR-support boundary stress ===\n");
console.log(`topologies=${N_TOPOS}  with |U|>0=${toposWithU}  with OR group=${toposWithOR}  transitions=${transitions}`);
console.log(`U ⊆ C                 : ${uSubC}/${transitions}`);
console.log(`ΔU ⊆ ΔC               : ${dUsubdC}/${transitions}`);
console.log(`PhaseBOnlyDelta ⊆ ΔC  : ${phaseBSubdC}/${transitions}`);
console.log(`failures=${failures.length}`);
for (const f of failures.slice(0, 10)) console.log(`  seed=${f.seed} ${f.kind} ${f.detail}`);
console.log(`\n[INVARIANT] all hold ? ${failures.length === 0}`);
