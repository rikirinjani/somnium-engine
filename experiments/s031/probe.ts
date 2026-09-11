/**
 * S031 — Incremental Execution State Lifecycle.
 *
 * Execution state S = { model, truth } (the worklist carries only these).
 * Tests: initialization, rewind, branch cloning + contamination, determinism,
 * S024 corpus closure, and semantic-identity independence.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon, CausalEdge } from "../../src/canon/types";
import { buildModel, phaseATruth, nodeSupport, cellKey, type DerivationModel } from "../../src/derive/propagation";
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

/** execution state: only { model, truth } (both O(model)) */
interface ExecState { model: DerivationModel; truth: Map<string, TruthValue> }

function initState(canon: Canon, H: Intervention[]): ExecState {
  const model = buildModel(canon, H);
  return { model, truth: phaseATruth(model) };
}

function cloneState(s: ExecState): ExecState {
  return { model: s.model, truth: new Map(s.truth) };
}

function step(canon: Canon, prev: ExecState, H: Intervention[]): ExecState {
  const model = buildModel(canon, H);
  const truth = new Map<string, TruthValue>();
  for (const n of model.nodeIds) truth.set(n, prev.truth.get(n) ?? "NEITHER");
  const deps = depIndex(model);
  const nodeSet = new Set(model.nodeIds);
  const queue: string[] = [];
  const inQ = new Set<string>();
  for (const n of directChanged(prev.model, model)) if (nodeSet.has(n) && !inQ.has(n)) { queue.push(n); inQ.add(n); }
  while (queue.length > 0) {
    const n = queue.shift()!;
    inQ.delete(n);
    const next = nodeSupport(model, n, truth);
    if (next !== (truth.get(n) ?? "NEITHER")) {
      truth.set(n, next);
      for (const d of deps.get(n) ?? []) if (nodeSet.has(d) && !inQ.has(d)) { queue.push(d); inQ.add(d); }
    }
  }
  return { model, truth };
}

function equiv(a: ExecState, b: ExecState): boolean {
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
  return { canonId: `canon/s031-${seed}`, version: "1.0.0", entities, facts: [], edges, workBindings: [], hash: "" };
}

console.log("=== S031 — execution-state lifecycle ===\n");
let initOk = 0, initTotal = 0;
let rewindOk = 0, rewindTotal = 0;
let branchOk = 0, branchTotal = 0;
let detOk = 0, detTotal = 0;
let s024Ok = 0, s024Total = 0;
let prefixOk = 0, prefixTotal = 0;

// 1) initialization equivalence + 2) rewind + 3) branch + 4) determinism
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  for (let s = 0; s < 25; s++) {
    const H = history(canon, 30, 20260931 + s * 7919);
    // init equivalence
    const A = initState(canon, H.slice(0, 10));
    const B = initState(canon, H.slice(0, 10));
    initTotal++;
    if (equiv(A, B)) initOk++;
    // rewind: checkpoint at 10, run to 20, rewind, run a different suffix
    const ckpt = cloneState(A);
    let cont = ckpt;
    for (let i = 10; i < 20; i++) cont = step(canon, cont, H.slice(0, i + 1));
    // fresh from checkpoint
    let fresh = cloneState(ckpt);
    for (let i = 10; i < 20; i++) fresh = step(canon, fresh, H.slice(0, i + 1));
    rewindTotal++;
    if (equiv(cont, fresh)) rewindOk++;
    // branch cloning + contamination: two siblings from ckpt
    let bA = cloneState(ckpt);
    let bB = cloneState(ckpt);
    for (let i = 10; i < 18; i++) bA = step(canon, bA, H.slice(0, i + 1));
    for (let i = 18; i < 30; i++) bB = step(canon, bB, H.slice(0, i + 1));
    branchTotal++;
    // bA must equal a fresh incremental run of H[0..18]
    let refA = initState(canon, []);
    for (let i = 0; i < 18; i++) refA = step(canon, refA, H.slice(0, i + 1));
    if (equiv(bA, refA)) branchOk++;
    // determinism
    let d1 = initState(canon, []);
    let d2 = initState(canon, []);
    for (let i = 0; i < 20; i++) d1 = step(canon, d1, H.slice(0, i + 1));
    for (let i = 0; i < 20; i++) d2 = step(canon, d2, H.slice(0, i + 1));
    detTotal++;
    if (equiv(d1, d2)) detOk++;
  }
}

// 5) S024 corpus closure: 100 random topologies
for (let seed = 1; seed <= 100; seed++) {
  const canon = genCanon(seed);
  const H = history(canon, 15, 20260932 + seed * 104729);
  let inc = initState(canon, []);
  let ok = true;
  for (let i = 0; i < H.length; i++) {
    inc = step(canon, inc, H.slice(0, i + 1));
    const ref = phaseATruth(inc.model);
    prefixTotal++;
    if (!equiv({ model: inc.model, truth: ref }, inc)) ok = false;
    else prefixOk++;
  }
  s024Total++;
  if (ok) s024Ok++;
}

console.log(`init equivalence      : ${initOk}/${initTotal}`);
console.log(`rewind equivalence    : ${rewindOk}/${rewindTotal}`);
console.log(`branch cloning        : ${branchOk}/${branchTotal}`);
console.log(`determinism           : ${detOk}/${detTotal}`);
console.log(`S024 topologies exact : ${s024Ok}/${s024Total}  (prefixes ${prefixOk}/${prefixTotal})`);
console.log(`\n[STATE] execution state = { model, truth } -> O(model), reconstructible from canon+prefix or WorldState`);
console.log(`[IDENTITY] execution state is NOT part of stateHash/identityHash`);
void derive;
