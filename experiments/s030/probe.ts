/**
 * S030 — Event-Driven Aggregate Worklist / Performance Equivalence.
 *
 * TARGET: true event-driven worklist Phase A (recompute only queued nodes via the
 * AUTHORITATIVE nodeSupport), + authoritative Phase B.
 * REF-A: from-scratch derive.
 * REF-B: S029 reset-scope incremental.
 *
 * Prefix-by-prefix equivalence is the gate.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, phaseATruth, nodeSupport, cellKey, type DerivationModel } from "../../src/derive/propagation";
import { type TruthValue } from "../../src/derive/judgment";
import { canonicalJson } from "../../src/canon/hash";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
  relocate,
} from "../../src/timeline/types";

function depIndex(model: DerivationModel): Map<string, string[]> {
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
  for (const fact of model.facts.values()) {
    if (fact.validFrom !== null) add(fact.validFrom, fact.id);
    if (fact.validTo !== null) add(fact.validTo, fact.id);
    add(`cell:${cellKey(fact.subject, fact.predicate)}`, fact.id);
  }
  return out;
}

function directChanged(a: DerivationModel, b: DerivationModel): string[] {
  const out = new Set<string>();
  for (const n of a.negated) if (!b.negated.has(n)) out.add(n);
  for (const n of b.negated) if (!a.negated.has(n)) out.add(n);
  for (const n of a.retracted) if (!b.retracted.has(n)) out.add(n);
  for (const n of b.retracted) if (!a.retracted.has(n)) out.add(n);
  for (const k of new Set([...a.forcedBy.keys(), ...b.forcedBy.keys()])) if (a.forcedBy.get(k) !== b.forcedBy.get(k)) out.add(k);
  for (const k of new Set([...a.overriddenCells.keys(), ...b.overriddenCells.keys()])) {
    if (canonicalJson(a.overriddenCells.get(k)) !== canonicalJson(b.overriddenCells.get(k))) {
      out.add(`cell:${k}`);
      try {
        const [s, p] = JSON.parse(k) as [string, string];
        for (const f of [...a.facts.values(), ...b.facts.values()]) if (f.subject === s && f.predicate === p) out.add(f.id);
      } catch { /* ignore */ }
    }
  }
  const ae = new Map(a.edges.map((e) => [e.id, e]));
  const be = new Map(b.edges.map((e) => [e.id, e]));
  for (const id of new Set([...ae.keys(), ...be.keys()])) {
    if (canonicalJson(ae.get(id)) !== canonicalJson(be.get(id))) {
      for (const e of [ae.get(id), be.get(id)]) if (e !== undefined) { out.add(e.from); out.add(e.to); }
    }
  }
  const an = new Set(a.nodeIds);
  const bn = new Set(b.nodeIds);
  for (const n of an) if (!bn.has(n)) out.add(n);
  for (const n of bn) if (!an.has(n)) out.add(n);
  return [...out];
}

interface Metrics { pushes: number; pops: number; changed: number; maxDepth: number }

function worklistPhaseA(canon: Canon, prevModel: DerivationModel, prevTruth: Map<string, TruthValue>, H: Intervention[]): { model: DerivationModel; truth: Map<string, TruthValue>; metrics: Metrics } {
  const model = buildModel(canon, H);
  const truth = new Map<string, TruthValue>();
  for (const n of model.nodeIds) truth.set(n, prevTruth.get(n) ?? "NEITHER");
  const deps = depIndex(model);
  const nodeSet = new Set(model.nodeIds);
  const queue: string[] = [];
  const inQ = new Set<string>();
  for (const n of directChanged(prevModel, model)) if (nodeSet.has(n) && !inQ.has(n)) { queue.push(n); inQ.add(n); }
  const m: Metrics = { pushes: queue.length, pops: 0, changed: 0, maxDepth: queue.length };
  while (queue.length > 0) {
    if (queue.length > m.maxDepth) m.maxDepth = queue.length;
    const n = queue.shift()!;
    inQ.delete(n);
    m.pops++;
    const next = nodeSupport(model, n, truth);
    if (next !== (truth.get(n) ?? "NEITHER")) {
      truth.set(n, next);
      m.changed++;
      for (const d of deps.get(n) ?? []) if (nodeSet.has(d) && !inQ.has(d)) { queue.push(d); inQ.add(d); m.pushes++; }
    }
  }
  return { model, truth, metrics: m };
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
    if (roll < 0.35 && ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), objs.length > 0 ? pick(objs) : true, "r"));
    else if (roll < 0.5 && evs.length > 0) out.push(negateEvent(pick(evs), "r"));
    else if (roll < 0.65 && evs.length > 0) out.push(forceEvent(pick(evs), "r"));
    else if (roll < 0.78 && factIds.length > 0) out.push(retractFact(pick(factIds), "r"));
    else if (roll < 0.88 && edges.length > 0) out.push(severEdge(pick(edges).id, "r"));
    else if (edges.length > 0) out.push(addEdge({ ...pick(edges) }, "r"));
    else if (ents.length > 1) out.push(relocate(ents[0]!, ents[1]!, "r"));
  }
  return out;
}

console.log("=== S030 — event-driven worklist prefix differential ===\n");
let prefixes = 0;
let mismatch = 0;
let firstDiv: string | null = null;
let totalProcessed = 0;
let totalNodes = 0;
const specs: [number, number][] = [[100, 20], [30, 100]];
for (const [nHist, H] of specs) {
  for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
    const canon = mk();
    for (let s = 0; s < nHist; s++) {
      const h = history(canon, H, 20260930 + s * 104729);
      let prevModel = buildModel(canon, []);
      let prevTruth = phaseATruth(prevModel);
      let steps: Intervention[] = [];
      for (const iv of h) {
        steps = [...steps, iv];
        const { model, truth, metrics } = worklistPhaseA(canon, prevModel, prevTruth, steps);
        const ref = phaseATruth(model);
        prefixes++;
        totalProcessed += metrics.pops;
        totalNodes += model.nodeIds.length;
        const d = model.nodeIds.filter((x) => (ref.get(x) ?? "NEITHER") !== (truth.get(x) ?? "NEITHER")).length;
        if (d > 0) {
          mismatch++;
          if (firstDiv === null) firstDiv = `${name} nHist=${nHist} seed=${s} prefix=${steps.length} iv=${iv.kind}:${iv.target} d=${d}`;
        }
        prevModel = model;
        prevTruth = truth;
      }
    }
  }
}
console.log(`prefixes=${prefixes} mismatched=${mismatch} (${((mismatch / prefixes) * 100).toFixed(2)}%)`);
if (firstDiv) console.log(`first divergence: ${firstDiv}`);
console.log(`[EQUIVALENT] TARGET == REF-A ? ${mismatch === 0}`);
console.log(`\n[WORKLIST] avg nodes processed/step=${(totalProcessed / prefixes).toFixed(2)}  avg model nodes=${(totalNodes / prefixes).toFixed(2)}`);
