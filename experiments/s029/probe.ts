/**
 * S029 — Event-Driven Incremental Phase-A Implementation / Exact Equivalence.
 *
 * Execution strategy (NO new semantics):
 *   previous Phase-A truth
 *   + intervention
 *   -> directChanged (S028 complete dependency delta)
 *   -> closure over the S028 dependency index
 *   -> reset that closure to NEITHER
 *   -> authoritative seeded positiveFixpoint (phaseATruth)
 *   -> Phase A result
 *   -> authoritative Phase B (unchanged)
 *
 * Differential vs from-scratch derive at EVERY prefix.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, phaseATruth, cellKey, observeUnfoundedSet, type DerivationModel } from "../../src/derive/propagation";
import { derive } from "../../src/derive/world-state";
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

/** S028 COMPLETE dependency index (no speculative classes). */
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

/** S028 complete direct-change set. */
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

function closure(seed: Iterable<string>, d: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const q = [...seed];
  while (q.length) {
    const n = q.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const x of d.get(n) ?? []) if (!seen.has(x)) q.push(x);
  }
  return seen;
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

/** incremental Phase A: prior truth + intervention -> Phase-A truth */
function incStep(canon: Canon, prevModel: DerivationModel, prevTruth: Map<string, TruthValue>, H: Intervention[]): { model: DerivationModel; truth: Map<string, TruthValue>; resetSize: number } {
  const model = buildModel(canon, H);
  const reset = closure(directChanged(prevModel, model), depIndex(model));
  const seed = new Map<string, TruthValue>();
  for (const n of model.nodeIds) seed.set(n, reset.has(n) ? "NEITHER" : prevTruth.get(n) ?? "NEITHER");
  return { model, truth: phaseATruth(model, seed), resetSize: reset.size };
}

console.log("=== S029 — incremental Phase A prefix differential ===\n");
let prefixes = 0;
let mismatch = 0;
let firstDiv: string | null = null;
const histSpecs: [number, number][] = [[100, 20], [30, 100]];
for (const [nHist, H] of histSpecs) {
  for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
    const canon = mk();
    for (let s = 0; s < nHist; s++) {
      const h = history(canon, H, 20260929 + s * 104729);
      let prevModel = buildModel(canon, []);
      let prevTruth = phaseATruth(prevModel);
      let steps: Intervention[] = [];
      for (const iv of h) {
        steps = [...steps, iv];
        const { model, truth } = incStep(canon, prevModel, prevTruth, steps);
        const ref = phaseATruth(model);
        prefixes++;
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
console.log(`[EQUIVALENT] ${mismatch === 0}`);

// Phase-B integration + U subset of C / dU subset of dC on the integrated engine
console.log("\n=== Phase-B integration (U subset of C, dU subset of dC) ===");
let integrated = 0;
let uSubC = 0;
let dUsubdC = 0;
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  for (let s = 0; s < 20; s++) {
    const h = history(canon, 20, 20260929 + s * 104729);
    let prevModel = buildModel(canon, []);
    let prevTruth = phaseATruth(prevModel);
    let prevObs = observeUnfoundedSet(prevModel);
    let steps: Intervention[] = [];
    for (const iv of h) {
      steps = [...steps, iv];
      const { model, truth } = incStep(canon, prevModel, prevTruth, steps);
      // authoritative Phase B on the incremental Phase-A result
      const obs = observeUnfoundedSet(model);
      integrated++;
      if (obs.unfounded.every((n) => obs.candidates.includes(n))) uSubC++;
      const dU = [...prevObs.unfounded.filter((n) => !obs.unfounded.includes(n)), ...obs.unfounded.filter((n) => !prevObs.unfounded.includes(n))];
      const dC = [...prevObs.candidates.filter((n) => !obs.candidates.includes(n)), ...obs.candidates.filter((n) => !prevObs.candidates.includes(n))];
      if (dU.every((n) => dC.includes(n))) dUsubdC++;
      prevModel = model;
      prevTruth = truth;
      prevObs = obs;
    }
  }
}
console.log(`steps=${integrated} U⊆C=${uSubC} ΔU⊆ΔC=${dUsubdC}`);
void derive;
