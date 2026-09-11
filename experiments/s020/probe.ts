/**
 * S020 — Decision Provenance / Minimum Sound Invalidation.
 *
 * Observation model: record the RULE that decided each node ("negated" |
 * "forced" | "support" | "unfounded"), then test whether a rule-based
 * `isStillSupported` predicate is SOUND (no stale judgment classified
 * STILL_VALID when the reference changes it).
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, propagationObserve } from "../../src/derive/propagation";
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

console.log("=== S020 — decision provenance + rule-based invalidation predicate ===\n");
let total = 0;
let fn = 0; // stale judgments classified STILL_VALID that the reference CHANGED
let fp = 0;
let invalidated = 0;
const byKind: Record<string, { n: number; fn: number; fp: number }> = {};

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260925);
  let prevObs = propagationObserve(buildModel(canon, []));
  for (let i = 0; i < H.length; i++) {
    const after = buildModel(canon, H.slice(0, i + 1));
    const ref = propagationObserve(after);
    total++;
    const k = H[i]!.kind;
    const r = (byKind[k] ??= { n: 0, fn: 0, fp: 0 });
    r.n++;
    for (const node of after.nodeIds) {
      const prev = prevObs.truth.get(node) ?? "NEITHER";
      const cur = ref.truth.get(node) ?? "NEITHER";
      if (prev === "NEITHER") continue; // not previously established
      const rule = prevObs.provenance.get(node) ?? "unknown";
      // predicate: STILL_VALID iff the deciding evidence is unchanged
      let stillValid = false;
      if (rule === "negated") stillValid = after.negated.has(node);
      else if (rule === "forced") stillValid = after.forcedBy.has(node);
      else if (rule === "support") stillValid = true; // optimistic: assume support holds
      else stillValid = false; // unfounded / unknown -> conservative
      if (stillValid) {
        if (cur !== prev) {
          fn++; // stale classified STILL_VALID but reference changed it
          r.fn++;
        }
      } else {
        invalidated++;
        if (cur === prev) {
          fp++; // invalidated but reference kept it
          r.fp++;
        }
      }
    }
    prevObs = ref;
  }
}

console.log(`steps=${total} stale-kept(FN)=${fn} needless-invalidated(FP)=${fp} invalidated=${invalidated}`);
console.log("kind          n    FN   FP");
for (const [k, r] of Object.entries(byKind)) {
  console.log(`  ${k.padEnd(12)}${String(r.n).padStart(3)} ${String(r.fn).padStart(5)} ${String(r.fp).padStart(4)}`);
}
console.log(`\n[SOUND] rule-based predicate FN===0 ? ${fn === 0}`);

// provenance rule distribution
const dist: Record<string, number> = {};
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const obs = propagationObserve(buildModel(mk(), history(mk(), 50, 1)));
  for (const v of obs.provenance.values()) dist[v] = (dist[v] ?? 0) + 1;
}
console.log("\nprovenance rule distribution:", JSON.stringify(dist));
