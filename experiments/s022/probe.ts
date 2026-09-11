/**
 * S022 — Unfounded-Set Candidate Boundary.
 *
 * Observe the Phase-B scan domain (candidates = NEITHER set), the unfounded set,
 * and their cross-prefix deltas. Question: is Phase B
 *   GLOBAL SCAN + LOCAL RESULT,  or  GLOBAL SCAN + GLOBAL RESULT?
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, observeUnfoundedSet } from "../../src/derive/propagation";
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

console.log("=== S022 — Phase-B candidate / unfounded boundary ===\n");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260927);
  const byKind: Record<string, { n: number; cand: number; dC: number; unf: number; dU: number; dSem: number }> = {};
  let prevObs = observeUnfoundedSet(buildModel(canon, []));
  let prevJ = derive(canon, []).judgments as Record<string, unknown>;
  for (let i = 0; i < H.length; i++) {
    const model = buildModel(canon, H.slice(0, i + 1));
    const obs = observeUnfoundedSet(model);
    const curJ = derive(canon, H.slice(0, i + 1)).judgments as Record<string, unknown>;

    const prevC = new Set(prevObs.candidates);
    const curC = new Set(obs.candidates);
    let dC = 0;
    for (const n of prevC) if (!curC.has(n)) dC++;
    for (const n of curC) if (!prevC.has(n)) dC++;
    const prevU = new Set(prevObs.unfounded);
    const curU = new Set(obs.unfounded);
    let dU = 0;
    for (const n of prevU) if (!curU.has(n)) dU++;
    for (const n of curU) if (!prevU.has(n)) dU++;
    let dSem = 0;
    for (const n of new Set([...Object.keys(prevJ), ...Object.keys(curJ)])) if (canonicalJson(prevJ[n]) !== canonicalJson(curJ[n])) dSem++;

    const k = H[i]!.kind;
    const r = (byKind[k] ??= { n: 0, cand: 0, dC: 0, unf: 0, dU: 0, dSem: 0 });
    r.n++; r.cand += obs.candidates.length; r.dC += dC; r.unf += obs.unfounded.length; r.dU += dU; r.dSem += dSem;
    prevObs = obs;
    prevJ = curJ;
  }
  const total = buildModel(canon, H).nodeIds.length;
  console.log(`--- ${name} (model nodes=${total}) ---`);
  console.log("  kind          n   |C|   dC   |U|   dU   dSem");
  for (const [k, r] of Object.entries(byKind)) {
    console.log(
      `  ${k.padEnd(12)}${String(r.n).padStart(3)} ${(r.cand / r.n).toFixed(2).padStart(5)} ${(r.dC / r.n).toFixed(2).padStart(4)} ` +
        `${(r.unf / r.n).toFixed(2).padStart(5)} ${(r.dU / r.n).toFixed(2).padStart(4)} ${(r.dSem / r.n).toFixed(2).padStart(5)}`
    );
  }
}
console.log("\n[READ] |C| = candidate (NEITHER) set size; dC = its cross-prefix delta; |U| = unfounded size; dU = its delta; dSem = semantic delta");
