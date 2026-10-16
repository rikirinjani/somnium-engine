/**
 * S033 — Full Correctness Gate and Wall-Clock Performance Validation.
 *
 * TARGET: corrected event-driven worklist (reset the dependency closure, seed the
 * queue with it, propagate via authoritative nodeSupport).
 * REF-A: from-scratch derive.  REF-B: reset-scope (S029 style).
 */
import { performance } from "node:perf_hooks";
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon, CausalEdge } from "../../src/canon/types";
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

interface Exec { model: DerivationModel; truth: Map<string, TruthValue> }

function stepTARGET(canon: Canon, prev: Exec, H: Intervention[]): { exec: Exec; processed: number; reset: number } {
  const model = buildModel(canon, H);
  const deps = depIndex(model);
  const reset = closure(directChanged(prev.model, model), deps);
  const truth = new Map<string, TruthValue>();
  for (const n of model.nodeIds) truth.set(n, reset.has(n) ? "NEITHER" : prev.truth.get(n) ?? "NEITHER");
  const nodeSet = new Set(model.nodeIds);
  const queue: string[] = [...reset].filter((n) => nodeSet.has(n));
  const inQ = new Set<string>(queue);
  let processed = 0;
  while (queue.length > 0) {
    const n = queue.shift()!;
    inQ.delete(n);
    processed++;
    const next = nodeSupport(model, n, truth);
    if (next !== (truth.get(n) ?? "NEITHER")) {
      truth.set(n, next);
      for (const d of deps.get(n) ?? []) if (nodeSet.has(d) && !inQ.has(d)) { queue.push(d); inQ.add(d); }
    }
  }
  return { exec: { model, truth }, processed, reset: reset.size };
}

function stepRESET(canon: Canon, prev: Exec, H: Intervention[]): Exec {
  const model = buildModel(canon, H);
  const reset = closure(directChanged(prev.model, model), depIndex(model));
  const truth = new Map<string, TruthValue>();
  for (const n of model.nodeIds) truth.set(n, reset.has(n) ? "NEITHER" : prev.truth.get(n) ?? "NEITHER");
  return { model, truth: phaseATruth(model, truth) };
}

function equiv(a: Exec, b: Exec): boolean {
  if (a.model.nodeIds.length !== b.model.nodeIds.length) return false;
  for (const n of a.model.nodeIds) if ((a.truth.get(n) ?? "NEITHER") !== (b.truth.get(n) ?? "NEITHER")) return false;
  return true;
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

function history(canon: Canon, h: number, seed: number, bias = 0): Intervention[] {
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
  void bias;
  return out;
}

function genCanon(seed: number): Canon {
  const rand = rng(seed);
  const n = 5 + Math.floor(rand() * 16);
  const entities = Array.from({ length: n }, (_, i) => ({ id: `ev/n${i}`, kind: "Event" as const, name: `n${i}` }));
  const edges: CausalEdge[] = [];
  let eid = 0;
  const req = (from: string, to: string, group?: string): void => {
    edges.push({ id: `e${eid++}`, kind: "REQUIRES", from, to, ...(group !== undefined ? { group } : {}) });
  };
  const m = 4 + Math.floor(rand() * (n * 1.5));
  for (let k = 0; k < m; k++) {
    const a = `ev/n${Math.floor(rand() * n)}`;
    const b = `ev/n${Math.floor(rand() * n)}`;
    if (a !== b) req(a, b);
  }
  if (rand() < 0.6 && n >= 2) { req("ev/n0", "ev/n1"); req("ev/n1", "ev/n0"); }
  if (rand() < 0.5 && n >= 6) { req("ev/n2", "ev/n5", "0"); req("ev/n3", "ev/n5", "0"); req("ev/n4", "ev/n5", "1"); }
  return { canonId: `canon/s033-${seed}`, version: "1.0.0", entities, facts: [], edges, workBindings: [], hash: "" };
}

// ---------- PHASE 1: correctness gate ----------
console.log("=== S033 — Phase 1 correctness gate ===\n");
let prefixes = 0, mismatches = 0, firstDiv: string | null = null;
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  for (const [nH, H] of [[100, 20], [100, 100]] as [number, number][]) {
    for (let s = 0; s < nH; s++) {
      const h = history(canon, H, 20261001 + s * 104729);
      let inc: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
      for (let i = 0; i < h.length; i++) {
        const r = stepTARGET(canon, inc, h.slice(0, i + 1));
        inc = r.exec;
        const ref = phaseATruth(inc.model);
        prefixes++;
        const d = inc.model.nodeIds.filter((x) => (ref.get(x) ?? "NEITHER") !== (inc.truth.get(x) ?? "NEITHER")).length;
        if (d > 0) { mismatches++; if (firstDiv === null) firstDiv = `${name} nH=${nH} seed=${s} prefix=${i + 1} iv=${h[i]!.kind}:${h[i]!.target} d=${d}`; }
      }
    }
  }
}
for (let seed = 1; seed <= 100; seed++) {
  const canon = genCanon(seed);
  const h = history(canon, 15, 20260932 + seed * 104729);
  let inc: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
  for (let i = 0; i < h.length; i++) {
    inc = stepTARGET(canon, inc, h.slice(0, i + 1)).exec;
    const ref = phaseATruth(inc.model);
    prefixes++;
    const d = inc.model.nodeIds.filter((x) => (ref.get(x) ?? "NEITHER") !== (inc.truth.get(x) ?? "NEITHER")).length;
    if (d > 0) { mismatches++; if (firstDiv === null) firstDiv = `s024 seed=${seed} prefix=${i + 1} d=${d}`; }
  }
}
console.log(`prefixes=${prefixes} mismatches=${mismatches}`);
if (firstDiv) console.log(`first divergence: ${firstDiv}`);
console.log(`[CORRECTNESS] ${mismatches === 0 ? "CLEAN" : "FAIL"}`);

// ---------- PHASE 2: determinism + branch ----------
let detOk = 0, detTotal = 0, brOk = 0, brTotal = 0;
{
  const canon = verrinCanon();
  for (let s = 0; s < 20; s++) {
    const h = history(canon, 30, 20261002 + s * 7919);
    let a: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    let b: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    for (let i = 0; i < h.length; i++) a = stepTARGET(canon, a, h.slice(0, i + 1)).exec;
    for (let i = 0; i < h.length; i++) b = stepTARGET(canon, b, h.slice(0, i + 1)).exec;
    detTotal++; if (equiv(a, b)) detOk++;
    // branch from an incremental state at prefix 10
    let ck: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    for (let i = 0; i < 10; i++) ck = stepTARGET(canon, ck, h.slice(0, i + 1)).exec;
    let bA: Exec = { model: ck.model, truth: new Map(ck.truth) };
    let bB: Exec = { model: ck.model, truth: new Map(ck.truth) };
    for (let i = 10; i < 20; i++) bA = stepTARGET(canon, bA, h.slice(0, i + 1)).exec;
    for (let i = 20; i < 30; i++) bB = stepTARGET(canon, bB, h.slice(0, i + 1)).exec;
    // bA must equal fresh incremental of prefix 20
    let fresh: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    for (let i = 0; i < 20; i++) fresh = stepTARGET(canon, fresh, h.slice(0, i + 1)).exec;
    brTotal++; if (equiv(bA, fresh)) brOk++;
  }
}
console.log(`\n[PHASE2] determinism=${detOk}/${detTotal} branch-from-incremental=${brOk}/${brTotal}`);

// ---------- PHASE 3: three-way performance ----------
console.log("\n=== S033 — Phase 3 performance (three-way) ===\n");
function workload(canon: Canon, h: number, seed: number, density: "sparse" | "medium" | "dense"): Intervention[] {
  if (density !== "sparse") return history(canon, h, seed);
  // sparse: repeat a small set of operations -> mostly no-ops
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const out: Intervention[] = [];
  for (let k = 0; k < h; k++) out.push(k % 2 === 0 ? forceEvent(evs[k % evs.length]!, "r") : addEdge({ ...edges[k % edges.length]! }, "r"));
  return out;
}
console.log("density  H      REF-A(ms)  REF-B(ms)  TARGET(ms)  A/B    A/T    B/T   reset  proc  model");
for (const density of ["sparse", "medium", "dense"] as const) {
  for (const H of [100, 1000, 10000]) {
    const canon = verrinCanon();
    const h = workload(canon, H, 20261003, density);
    // REF-A: derive each prefix from scratch
    let tA = performance.now();
    for (let i = 0; i < h.length; i++) buildModel(canon, h.slice(0, i + 1));
    tA = performance.now() - tA;
    // REF-B + TARGET
    let initModel = buildModel(canon, []);
    let rb: Exec = { model: initModel, truth: phaseATruth(initModel) };
    let tg: Exec = { model: initModel, truth: phaseATruth(initModel) };
    let tB = performance.now();
    for (let i = 0; i < h.length; i++) rb = stepRESET(canon, rb, h.slice(0, i + 1));
    tB = performance.now() - tB;
    let proc = 0, reset = 0;
    let tT = performance.now();
    for (let i = 0; i < h.length; i++) { const r = stepTARGET(canon, tg, h.slice(0, i + 1)); tg = r.exec; proc += r.processed; reset += r.reset; }
    tT = performance.now() - tT;
    const model = tg.model.nodeIds.length;
    console.log(
      `${density.padEnd(8)}${String(H).padEnd(7)}${tA.toFixed(0).padStart(9)}  ${tB.toFixed(0).padStart(8)}  ${tT.toFixed(0).padStart(10)}  ` +
        `${(tA / tB).toFixed(2).padStart(5)}  ${(tA / tT).toFixed(2).padStart(5)}  ${(tB / tT).toFixed(2).padStart(5)}  ` +
        `${(reset / H).toFixed(1).padStart(5)}  ${(proc / H).toFixed(2).padStart(5)}  ${model}`
    );
  }
}
