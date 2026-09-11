/**
 * S019 — Prior-Judgment Seeded Phase-A Equivalence.
 *
 * Experiment A (foundational): seed the ENTIRE previous authoritative truth map,
 * run the SAME Phase A/B rules, and compare against the from-scratch reference.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, propagationTruth } from "../../src/derive/propagation";
import { derive } from "../../src/derive/world-state";
import { canonicalJson } from "../../src/canon/hash";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
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

console.log("=== S019 — Experiment A: complete prior-truth seeding ===\n");
let total = 0;
let mismatched = 0;
let seededCells = 0;
const byKind: Record<string, { n: number; mismatch: number; examples: string[] }> = {};

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260924);
  let prevTruth = propagationTruth(buildModel(canon, []));
  for (let i = 0; i < H.length; i++) {
    const after = buildModel(canon, H.slice(0, i + 1));
    const ref = propagationTruth(after);
    const seeded = propagationTruth(after, prevTruth);
    total++;
    seededCells += prevTruth.size;
    let bad = 0;
    const examples: string[] = [];
    for (const node of after.nodeIds) {
      const a = ref.get(node) ?? "NEITHER";
      const b = seeded.get(node) ?? "NEITHER";
      if (a !== b) {
        bad++;
        if (examples.length < 3) examples.push(`${node}: ref=${a} seeded=${b}`);
      }
    }
    const k = H[i]!.kind;
    const r = (byKind[k] ??= { n: 0, mismatch: 0, examples: [] });
    r.n++;
    if (bad > 0) {
      mismatched++;
      r.mismatch++;
      if (r.examples.length < 3) r.examples.push(examples[0] ?? "");
    }
    prevTruth = ref;
  }
}

console.log(`steps=${total} mismatched=${mismatched} (${((mismatched / total) * 100).toFixed(1)}%)`);
console.log("kind          n   mismatch   example");
for (const [k, r] of Object.entries(byKind)) {
  console.log(`  ${k.padEnd(12)}${String(r.n).padStart(3)}  ${String(r.mismatch).padStart(8)}   ${r.examples[0] ?? ""}`);
}
console.log(`\n[VERDICT-A] complete prior-truth seeding ${mismatched === 0 ? "IS" : "IS NOT"} reference-equivalent`);

// Negative control: a support-removing intervention.
const v = verrinCanon();
const evs = v.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
const e0 = evs[0]!;
const base = [forceEvent(e0, "x")];
const t0 = propagationTruth(buildModel(v, base));
const after = buildModel(v, [...base, negateEvent(e0, "x")]);
const refT = propagationTruth(after);
const seedT = propagationTruth(after, t0);
console.log(`\n[CONTROL] force -> negate on ${e0}`);
console.log(`  ref   ${e0} = ${refT.get(e0)}`);
console.log(`  seed  ${e0} = ${seedT.get(e0)}`);
console.log(`  stale: ${refT.get(e0) !== seedT.get(e0)}`);
