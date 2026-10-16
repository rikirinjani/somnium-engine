/**
 * S018 — Node-Set & Topology-Aware Frontier Soundness.
 *
 * S017's frontier missed nodes because edge mutations change the NODE SET.
 * S018 adds, pre-propagation:
 *   F = Δnodes ∪ edge-endpoint delta ∪ reverse closure ∪ cycle membership
 * and tests whether FN reaches zero.
 *
 * Observation only. `derive`/`propagateJudgments` semantics untouched.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, type DerivationModel } from "../../src/derive/propagation";
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

function reverseIndex(model: DerivationModel): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (f: string, t: string): void => {
    const l = out.get(f) ?? [];
    l.push(t);
    out.set(f, l);
  };
  for (const [t, groups] of model.supportGroups) for (const g of groups) for (const c of g.conjuncts) add(c, t);
  for (const [t, srcs] of model.enablesIn) for (const s of srcs) add(s, t);
  for (const e of model.excludesEdges) { add(e.from, e.to); add(e.to, e.from); }
  for (const e of model.invariantEdges) add(e.from, e.to);
  for (const e of model.precedesEdges) { add(e.from, e.to); add(e.to, e.from); }
  return out;
}

function closure(seed: Iterable<string>, deps: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const q = [...seed];
  while (q.length) {
    const n = q.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of deps.get(n) ?? []) if (!seen.has(d)) q.push(d);
  }
  return seen;
}

function cycleMembers(model: DerivationModel): Set<string> {
  const out = new Set<string>();
  for (const [target, groups] of model.supportGroups) {
    for (const g of groups) for (const c of g.conjuncts) {
      const seen = new Set<string>();
      const q = [target];
      while (q.length) {
        const n = q.pop()!;
        if (n === c) { out.add(c); out.add(target); break; }
        if (seen.has(n)) continue;
        seen.add(n);
        for (const g2 of model.supportGroups.get(n) ?? []) for (const c2 of g2.conjuncts) q.push(c2);
      }
    }
  }
  return out;
}

/** structural delta: node-set + edge-endpoint + accumulator changes */
function structuralDelta(a: DerivationModel, b: DerivationModel): { seed: Set<string>; nodeSet: Set<string> } {
  const seed = new Set<string>();
  const nodeSet = new Set<string>();
  const an = new Set(a.nodeIds);
  const bn = new Set(b.nodeIds);
  for (const n of an) if (!bn.has(n)) { seed.add(n); nodeSet.add(n); }
  for (const n of bn) if (!an.has(n)) { seed.add(n); nodeSet.add(n); }
  // edge endpoints of any edge whose presence/content changed
  const aById = new Map(a.edges.map((e) => [e.id, e]));
  const bById = new Map(b.edges.map((e) => [e.id, e]));
  for (const id of new Set([...aById.keys(), ...bById.keys()])) {
    const x = aById.get(id);
    const y = bById.get(id);
    if (canonicalJson(x) !== canonicalJson(y)) {
      for (const e of [x, y]) if (e !== undefined) { seed.add(e.from); seed.add(e.to); nodeSet.add(e.from); nodeSet.add(e.to); }
    }
  }
  // accumulator changes
  for (const n of a.negated) if (!b.negated.has(n)) seed.add(n);
  for (const n of b.negated) if (!a.negated.has(n)) seed.add(n);
  for (const n of a.retracted) if (!b.retracted.has(n)) seed.add(n);
  for (const n of b.retracted) if (!a.retracted.has(n)) seed.add(n);
  for (const k of new Set([...a.forcedBy.keys(), ...b.forcedBy.keys()])) if (a.forcedBy.get(k) !== b.forcedBy.get(k)) seed.add(k);
  for (const k of new Set([...a.overriddenCells.keys(), ...b.overriddenCells.keys()])) {
    if (canonicalJson(a.overriddenCells.get(k)) !== canonicalJson(b.overriddenCells.get(k))) {
      try {
        const [s, p] = JSON.parse(k) as [string, string];
        for (const f of [...a.facts.values(), ...b.facts.values()]) if (f.subject === s && f.predicate === p) seed.add(f.id);
      } catch { /* ignore */ }
    }
  }
  return { seed, nodeSet };
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

console.log("=== S018 — topology-aware frontier soundness ===\n");
let grandFN17 = 0;
let grandFN18 = 0;
let grandFP18 = 0;
let grandDelta = 0;
let grandF18 = 0;
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260923);
  const byKind: Record<string, { n: number; delta: number; f17: number; f18: number; fn17: number; fn18: number; fp18: number }> = {};
  let prevJ = derive(canon, []).judgments as Record<string, unknown>;
  for (let i = 0; i < H.length; i++) {
    const before = buildModel(canon, H.slice(0, i));
    const after = buildModel(canon, H.slice(0, i + 1));
    const curJ = derive(canon, H.slice(0, i + 1)).judgments as Record<string, unknown>;
    const delta = new Set<string>();
    for (const n of new Set([...Object.keys(prevJ), ...Object.keys(curJ)])) if (canonicalJson(prevJ[n]) !== canonicalJson(curJ[n])) delta.add(n);

    const deps = reverseIndex(after);
    const cyc = cycleMembers(after);
    const { seed, nodeSet } = structuralDelta(before, after);

    // S017 frontier: reverse closure only
    const f17 = closure(seed, deps);
    // S018 frontier: node-set delta ∪ endpoint delta ∪ reverse closure ∪ cycle membership
    const s18seed = new Set<string>([...seed, ...nodeSet, ...cyc]);
    const f18 = closure(s18seed, deps);

    let fn17 = 0;
    for (const n of delta) if (!f17.has(n)) fn17++;
    let fn18 = 0;
    for (const n of delta) if (!f18.has(n)) fn18++;
    let fp18 = 0;
    for (const n of f18) if (!delta.has(n)) fp18++;

    const k = H[i]!.kind;
    const r = (byKind[k] ??= { n: 0, delta: 0, f17: 0, f18: 0, fn17: 0, fn18: 0, fp18: 0 });
    r.n++; r.delta += delta.size; r.f17 += f17.size; r.f18 += f18.size; r.fn17 += fn17; r.fn18 += fn18; r.fp18 += fp18;
    grandFN17 += fn17; grandFN18 += fn18; grandFP18 += fp18; grandDelta += delta.size; grandF18 += f18.size;
    prevJ = curJ;
  }
  console.log(`--- ${name} (model nodes=${buildModel(canon, H).nodeIds.length}) ---`);
  console.log("  kind          n   delta  F17   F18   FN17  FN18  FP18");
  for (const [k, r] of Object.entries(byKind)) {
    console.log(
      `  ${k.padEnd(12)}${String(r.n).padStart(3)}  ${(r.delta / r.n).toFixed(2).padStart(5)} ${(r.f17 / r.n).toFixed(2).padStart(5)} ${(r.f18 / r.n).toFixed(2).padStart(5)}  ` +
        `${(r.fn17 / r.n).toFixed(2).padStart(4)}  ${(r.fn18 / r.n).toFixed(2).padStart(4)}  ${(r.fp18 / r.n).toFixed(2).padStart(4)}`
    );
  }
}
console.log(`\n[TOTAL] delta=${grandDelta} FN(S017)=${grandFN17} FN(S018)=${grandFN18} FP(S018)=${grandFP18} F18=${grandF18}`);
console.log(`[SOUND] S018 frontier FN===0 ? ${grandFN18 === 0}`);
