/**
 * S012 — Phase 11/12: overhead of the incremental delta vs plain derive.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive, foldStateDeltas } from "../../src/derive/world-state";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";
import { performance } from "node:perf_hooks";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
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
    else if (ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), true, "r"));
  }
  return out;
}

console.log("H\tcanon\tplain(ms)\tdelta(ms)\toverhead\tretained");
for (const h of [10, 100, 1000, 3000, 10000]) {
  for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
    const canon = mk();
    const H = history(canon, h, 20260915);
    const t0 = performance.now();
    derive(canon, H);
    const plain = performance.now() - t0;
    const t1 = performance.now();
    const deltas = foldStateDeltas(canon, H);
    const delta = performance.now() - t1;
    const retained = deltas.filter((d) => d.components.length > 0).length;
    console.log(`${h}\t${name}\t${plain.toFixed(1)}\t\t${delta.toFixed(1)}\t\t${(delta / plain).toFixed(2)}x\t${retained}/${h}`);
  }
}
