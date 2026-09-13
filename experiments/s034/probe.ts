/**
 * S034 — Incremental Derivation-Model Update / Exact Equivalence.
 *
 * Can the DerivationModel itself be maintained incrementally, one intervention
 * at a time, without changing authoritative semantics?
 *
 * TARGET: incremental model maintenance (apply one intervention to previous
 *         model instead of rebuilding from full chain)
 * REF-A:  from-scratch buildModel + from-scratch Phase-A
 */
import { performance } from "node:perf_hooks";
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon, CausalEdge, Fact } from "../../src/canon/types";
import {
  buildModel,
  phaseATruth,
  nodeSupport,
  cellKey,
  propagationTruth,
  type DerivationModel,
  type SupportGroup,
} from "../../src/derive/propagation";
import { type TruthValue } from "../../src/derive/judgment";
import { canonicalJson, sameCanonicalValue } from "../../src/canon/hash";
import { buildFactVocabulary, factAssertionError } from "../../src/canon/fact-rules";
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

// ─────────────────────────── helpers ───────────────────────────

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

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
  return { canonId: `canon/s034-${seed}`, version: "1.0.0", entities, facts: [], edges, workBindings: [], hash: "" };
}

// ─────────────────── incremental model maintenance ───────────────────

function rebuildDerived(model: DerivationModel, canon: Canon): void {
  const grouped = new Map<string, Map<string, string[]>>();
  for (const edge of model.edges) {
    if (edge.kind !== "REQUIRES") continue;
    const groups = grouped.get(edge.to) ?? new Map<string, string[]>();
    const key = edge.group ?? "0";
    const conjuncts = groups.get(key) ?? [];
    conjuncts.push(edge.from);
    groups.set(key, conjuncts);
    grouped.set(edge.to, groups);
  }
  model.supportGroups = new Map<string, SupportGroup[]>();
  for (const [target, groups] of grouped) {
    const list: SupportGroup[] = [...groups.entries()]
      .map(([group, conjuncts]) => ({ group, conjuncts: [...conjuncts].sort() }))
      .sort((a, b) => a.group.localeCompare(b.group));
    model.supportGroups.set(target, list);
  }
  model.enablesIn = new Map<string, string[]>();
  for (const edge of model.edges) {
    if (edge.kind !== "ENABLES") continue;
    const list = model.enablesIn.get(edge.to) ?? [];
    list.push(edge.from);
    model.enablesIn.set(edge.to, list);
  }
  for (const key of model.enablesIn.keys()) {
    (model.enablesIn.get(key) ?? []).sort();
  }
  model.precedesEdges = model.edges.filter((e) => e.kind === "PRECEDES");
  model.excludesEdges = model.edges.filter((e) => e.kind === "EXCLUDES");
  model.invariantEdges = model.edges.filter((e) => e.kind === "INVARIANT");

  const nodeSet = new Set<string>();
  for (const entity of canon.entities) {
    if (entity.kind === "Event") nodeSet.add(entity.id);
  }
  for (const edge of model.edges) {
    nodeSet.add(edge.from);
    nodeSet.add(edge.to);
  }
  for (const n of model.negated) nodeSet.add(n);
  for (const [k] of model.forcedBy) nodeSet.add(k);
  model.nodeIds = [...nodeSet].sort();

  const ns = new Set(model.nodeIds);
  model.facts = new Map<string, Fact>();
  for (const fact of canon.facts) {
    if (ns.has(fact.id)) model.facts.set(fact.id, fact);
  }
}

function incrementalApply(
  canon: Canon,
  prev: DerivationModel,
  iv: Intervention
): DerivationModel {
  const model: DerivationModel = {
    nodeIds: [...prev.nodeIds],
    declared: new Set(prev.declared),
    factVocabulary: prev.factVocabulary,
    rejectedFactWrites: [...prev.rejectedFactWrites],
    supportGroups: new Map([...prev.supportGroups].map(([k, v]) => [k, v.map((g) => ({ ...g, conjuncts: [...g.conjuncts] }))])),
    enablesIn: new Map([...prev.enablesIn].map(([k, v]) => [k, [...v]])),
    precedesEdges: [...prev.precedesEdges],
    excludesEdges: [...prev.excludesEdges],
    invariantEdges: [...prev.invariantEdges],
    negated: new Set(prev.negated),
    forcedBy: new Map(prev.forcedBy),
    facts: new Map(prev.facts),
    retracted: new Set(prev.retracted),
    overriddenCells: new Map(prev.overriddenCells),
    edges: [...prev.edges],
  };

  let edgeChanged = false;

  if (iv.kind === "negateEvent") {
    if (!model.negated.has(iv.target)) model.negated.add(iv.target);
  } else if (iv.kind === "forceEvent") {
    model.forcedBy.set(iv.target, iv.id);
  } else if (iv.kind === "retractFact") {
    if (!model.retracted.has(iv.target)) model.retracted.add(iv.target);
  } else if (iv.kind === "setFact" || iv.kind === "relocate") {
    const predicate = iv.kind === "setFact" ? iv.params?.predicate : "located_in";
    const object = iv.kind === "setFact" ? iv.params?.object : iv.params?.to;
    if (typeof predicate === "string") {
      const value = (object ?? null) as string | number | boolean | null;
      const error = factAssertionError(iv.target, predicate, value, model.factVocabulary);
      if (error !== null) {
        model.rejectedFactWrites.push({ subject: iv.target, predicate, source: iv.id, error });
      } else {
        const key = cellKey(iv.target, predicate);
        model.overriddenCells.set(key, value);
      }
    }
  } else if (iv.kind === "severEdge") {
    const n = model.edges.length;
    model.edges = model.edges.filter((e) => e.id !== iv.target);
    edgeChanged = model.edges.length !== n;
  } else if (iv.kind === "addEdge") {
    const raw = iv.params?.edge;
    if (raw !== null && typeof raw === "object") {
      const edge = raw as CausalEdge;
      if (typeof edge.id === "string" && typeof edge.kind === "string" && typeof edge.from === "string" && typeof edge.to === "string") {
        const guarded: CausalEdge = { ...edge };
        if (typeof guarded.group !== "string") delete guarded.group;
        const prevEdge = model.edges.find((e) => e.id === guarded.id);
        const same = prevEdge !== undefined && canonicalJson(prevEdge) === canonicalJson(guarded);
        model.edges = model.edges.filter((e) => e.id !== guarded.id);
        model.edges.push(guarded);
        model.edges.sort(byId);
        edgeChanged = !same;
      }
    }
  }

  if (edgeChanged) rebuildDerived(model, canon);
  return model;
}

// ─────────────────── model comparison ───────────────────

interface Mismatch { field: string; detail: string }

function compareModels(a: DerivationModel, b: DerivationModel): Mismatch[] {
  const m: Mismatch[] = [];
  const check = (field: string, eq: boolean, detail: string) => { if (!eq) m.push({ field, detail }); };

  check("nodeIds.length", a.nodeIds.length === b.nodeIds.length, `${a.nodeIds.length} vs ${b.nodeIds.length}`);
  if (a.nodeIds.length === b.nodeIds.length) {
    for (let i = 0; i < a.nodeIds.length; i++) {
      check("nodeIds", a.nodeIds[i] === b.nodeIds[i], `[${i}]: ${a.nodeIds[i]} vs ${b.nodeIds[i]}`);
      if (m.length > 0) break;
    }
  }
  check("declared.size", a.declared.size === b.declared.size, `${a.declared.size} vs ${b.declared.size}`);
  check("negated.size", a.negated.size === b.negated.size, `${a.negated.size} vs ${b.negated.size}`);
  check("forcedBy.size", a.forcedBy.size === b.forcedBy.size, `${a.forcedBy.size} vs ${b.forcedBy.size}`);
  check("retracted.size", a.retracted.size === b.retracted.size, `${a.retracted.size} vs ${b.retracted.size}`);
  check("overriddenCells.size", a.overriddenCells.size === b.overriddenCells.size, `${a.overriddenCells.size} vs ${b.overriddenCells.size}`);
  check("rejectedFactWrites.length", a.rejectedFactWrites.length === b.rejectedFactWrites.length, `${a.rejectedFactWrites.length} vs ${b.rejectedFactWrites.length}`);
  check("edges.length", a.edges.length === b.edges.length, `${a.edges.length} vs ${b.edges.length}`);
  check("supportGroups.size", a.supportGroups.size === b.supportGroups.size, `${a.supportGroups.size} vs ${b.supportGroups.size}`);
  check("enablesIn.size", a.enablesIn.size === b.enablesIn.size, `${a.enablesIn.size} vs ${b.enablesIn.size}`);
  check("precedesEdges.length", a.precedesEdges.length === b.precedesEdges.length, `${a.precedesEdges.length} vs ${b.precedesEdges.length}`);
  check("excludesEdges.length", a.excludesEdges.length === b.excludesEdges.length, `${a.excludesEdges.length} vs ${b.excludesEdges.length}`);
  check("invariantEdges.length", a.invariantEdges.length === b.invariantEdges.length, `${a.invariantEdges.length} vs ${b.invariantEdges.length}`);
  check("facts.size", a.facts.size === b.facts.size, `${a.facts.size} vs ${b.facts.size}`);

  if (m.length === 0) {
    for (let i = 0; i < a.edges.length; i++) {
      if (canonicalJson(a.edges[i]) !== canonicalJson(b.edges[i])) {
        m.push({ field: "edges", detail: `[${i}]: ${a.edges[i]!.id}` });
        break;
      }
    }
  }
  if (m.length === 0) {
    for (const [k, v] of a.supportGroups) {
      const bv = b.supportGroups.get(k);
      if (bv === undefined || JSON.stringify(v) !== JSON.stringify(bv)) {
        m.push({ field: "supportGroups", detail: k });
        break;
      }
    }
  }
  if (m.length === 0) {
    for (const n of a.negated) { if (!b.negated.has(n)) { m.push({ field: "negated", detail: n }); break; } }
  }
  if (m.length === 0) {
    for (const [k, v] of a.forcedBy) { if (b.forcedBy.get(k) !== v) { m.push({ field: "forcedBy", detail: k }); break; } }
  }
  if (m.length === 0) {
    for (const [k, v] of a.overriddenCells) {
      const bv = b.overriddenCells.get(k);
      if (!sameCanonicalValue(v, bv)) { m.push({ field: "overriddenCells", detail: k }); break; }
    }
  }
  if (m.length === 0) {
    for (const [k, v] of a.enablesIn) {
      const bv = b.enablesIn.get(k);
      if (bv === undefined || JSON.stringify(v) !== JSON.stringify(bv)) {
        m.push({ field: "enablesIn", detail: k });
        break;
      }
    }
  }
  return m;
}

function truthEqual(a: Map<string, TruthValue>, b: Map<string, TruthValue>, nodes: string[]): boolean {
  for (const n of nodes) {
    if ((a.get(n) ?? "NEITHER") !== (b.get(n) ?? "NEITHER")) return false;
  }
  return true;
}

// ─────────────────── worklist (from S033) ───────────────────

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

function stepTARGET(canon: Canon, prev: Exec, iv: Intervention): { exec: Exec; processed: number; reset: number } {
  const model = incrementalApply(canon, prev.model, iv);
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

// ═══════════════════════════════════════════════════════════════
// PHASE 1: correctness gate (25,500 prefixes)
// ═══════════════════════════════════════════════════════════════

console.log("=== S034 — Phase 1: model-by-model correctness ===\n");

let totalPrefixes = 0, totalModelMis = 0, totalTruthMis = 0;
let firstModelDiv: string | null = null, firstTruthDiv: string | null = null;

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  for (const [nH, H] of [[100, 20], [100, 100]] as [number, number][]) {
    for (let s = 0; s < nH; s++) {
      const h = history(canon, H, 20261001 + s * 104729);
      let incModel = buildModel(canon, []);
      for (let i = 0; i < h.length; i++) {
        incModel = incrementalApply(canon, incModel, h[i]!);
        const refModel = buildModel(canon, h.slice(0, i + 1));
        totalPrefixes++;
        const mis = compareModels(incModel, refModel);
        if (mis.length > 0) {
          totalModelMis++;
          if (firstModelDiv === null) firstModelDiv = `${name} H=${H} seed=${s} prefix=${i + 1} iv=${h[i]!.kind}:${h[i]!.target} fields=${mis.map((x) => x.field).join(",")}`;
        }
        const incTruth = phaseATruth(incModel);
        const refTruth = phaseATruth(refModel);
        if (!truthEqual(incTruth, refTruth, refModel.nodeIds)) {
          totalTruthMis++;
          if (firstTruthDiv === null) firstTruthDiv = `${name} H=${H} seed=${s} prefix=${i + 1} iv=${h[i]!.kind}:${h[i]!.target}`;
        }
      }
    }
  }
}
for (let seed = 1; seed <= 100; seed++) {
  const canon = genCanon(seed);
  const h = history(canon, 15, 20260932 + seed * 104729);
  let incModel = buildModel(canon, []);
  for (let i = 0; i < h.length; i++) {
    incModel = incrementalApply(canon, incModel, h[i]!);
    const refModel = buildModel(canon, h.slice(0, i + 1));
    totalPrefixes++;
    const mis = compareModels(incModel, refModel);
    if (mis.length > 0) {
      totalModelMis++;
      if (firstModelDiv === null) firstModelDiv = `s024 seed=${seed} prefix=${i + 1} iv=${h[i]!.kind}:${h[i]!.target} fields=${mis.map((x) => x.field).join(",")}`;
    }
    const incTruth = phaseATruth(incModel);
    const refTruth = phaseATruth(refModel);
    if (!truthEqual(incTruth, refTruth, refModel.nodeIds)) {
      totalTruthMis++;
      if (firstTruthDiv === null) firstTruthDiv = `s024 seed=${seed} prefix=${i + 1} iv=${h[i]!.kind}:${h[i]!.target}`;
    }
  }
}

console.log(`prefixes=${totalPrefixes} model_mismatches=${totalModelMis} truth_mismatches=${totalTruthMis}`);
if (firstModelDiv) console.log(`first model divergence: ${firstModelDiv}`);
if (firstTruthDiv) console.log(`first truth divergence: ${firstTruthDiv}`);
console.log(`[MODEL_CORRECTNESS] ${totalModelMis === 0 ? "CLEAN" : "FAIL"}`);
console.log(`[TRUTH_CORRECTNESS] ${totalTruthMis === 0 ? "CLEAN" : "FAIL"}`);

// ═══════════════════════════════════════════════════════════════
// PHASE 2: determinism + branch-from-incremental
// ═══════════════════════════════════════════════════════════════

console.log("\n=== S034 — Phase 2: determinism + branch ===\n");

let detOk = 0, detTotal = 0, brOk = 0, brTotal = 0;
{
  const canon = verrinCanon();
  for (let s = 0; s < 20; s++) {
    const h = history(canon, 30, 20261002 + s * 7919);
    // Determinism: run twice, compare
    let a: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    let b: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    for (let i = 0; i < h.length; i++) {
      a = stepTARGET(canon, a, h[i]!).exec;
      b = stepTARGET(canon, b, h[i]!).exec;
    }
    detTotal++;
    if (a.model.nodeIds.length === b.model.nodeIds.length && truthEqual(a.truth, b.truth, a.model.nodeIds)) detOk++;

    // Branch from incremental state at prefix 10
    let ck: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    for (let i = 0; i < 10; i++) ck = stepTARGET(canon, ck, h[i]!).exec;
    let bA: Exec = { model: ck.model, truth: new Map(ck.truth) };
    let bB: Exec = { model: ck.model, truth: new Map(ck.truth) };
    for (let i = 10; i < 20; i++) bA = stepTARGET(canon, bA, h[i]!).exec;
    for (let i = 20; i < 30; i++) bB = stepTARGET(canon, bB, h[i]!).exec;
    // bA must equal fresh incremental of prefix 20
    let fresh: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
    for (let i = 0; i < 20; i++) fresh = stepTARGET(canon, fresh, h[i]!).exec;
    brTotal++;
    if (bA.model.nodeIds.length === fresh.model.nodeIds.length && truthEqual(bA.truth, fresh.truth, fresh.model.nodeIds)) brOk++;
  }
}
console.log(`determinism=${detOk}/${detTotal} branch-from-incremental=${brOk}/${brTotal}`);

// ═══════════════════════════════════════════════════════════════
// PHASE 3: adversarial history tests
// ═══════════════════════════════════════════════════════════════

console.log("\n=== S034 — Phase 3: adversarial histories ===\n");

{
  const canon = verrinCanon();
  let advTotal = 0, advPass = 0;

  // Multi-fact cells: overlapping validity windows
  {
    const facts = canon.facts;
    const cells = [...new Set(facts.map((f) => `${f.subject}|${f.predicate}`))];
    for (const cell of cells.slice(0, 5)) {
      const [subject, predicate] = cell.split("|");
      const objs = facts.filter((f) => f.subject === subject && f.predicate === predicate).map((f) => f.object);
      if (objs.length < 2) continue;
      // set → retract → set with different objects
      const chain: Intervention[] = [
        setFact(subject, predicate, objs[0], "adv1"),
        setFact(subject, predicate, objs[1], "adv2"),
        retractFact(facts.find((f) => f.subject === subject && f.predicate === predicate)!.id, "adv3"),
        setFact(subject, predicate, objs[0], "adv4"),
      ];
      let incModel = buildModel(canon, []);
      for (const iv of chain) incModel = incrementalApply(canon, incModel, iv);
      const refModel = buildModel(canon, chain);
      advTotal++;
      if (compareModels(incModel, refModel).length === 0) advPass++;
      else console.log(`  FAIL: multi-fact cell ${cell}`);
    }
  }

  // Force/negate interactions
  {
    const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id);
    const scenarios: [string, Intervention[]][] = [
      ["force→negate", [forceEvent(evs[0]!, "a"), negateEvent(evs[0]!, "b")]],
      ["negate→force", [negateEvent(evs[0]!, "a"), forceEvent(evs[0]!, "b")]],
      ["repeated force", [forceEvent(evs[0]!, "a"), forceEvent(evs[0]!, "b")]],
      ["force on established", [forceEvent(evs[0]!, "a"), forceEvent(evs[0]!, "b")]],
    ];
    for (const [name, chain] of scenarios) {
      let incModel = buildModel(canon, []);
      for (const iv of chain) incModel = incrementalApply(canon, incModel, iv);
      const refModel = buildModel(canon, chain);
      advTotal++;
      if (compareModels(incModel, refModel).length === 0) advPass++;
      else console.log(`  FAIL: force/negate ${name}`);
    }
  }

  // Retraction: retract → restore-like writes
  {
    const factIds = canon.facts.map((f) => f.id);
    const facts = canon.facts;
    if (factIds.length > 0) {
      const f = facts[0]!;
      const chain: Intervention[] = [
        retractFact(f.id, "a"),
        setFact(f.subject, f.predicate, f.object, "b"),
      ];
      let incModel = buildModel(canon, []);
      for (const iv of chain) incModel = incrementalApply(canon, incModel, iv);
      const refModel = buildModel(canon, chain);
      advTotal++;
      if (compareModels(incModel, refModel).length === 0) advPass++;
      else console.log(`  FAIL: retract→restore`);
    }
  }

  // Edges: add → sever → add, multiple edges same endpoints
  {
    const edges = canon.edges;
    if (edges.length >= 2) {
      const e = edges[0]!;
      const chain: Intervention[] = [
        severEdge(e.id, "a"),
        addEdge({ ...e }, "b"),
        addEdge({ ...e, id: `${e.id}-dup`, group: "alt" }, "c"),
      ];
      let incModel = buildModel(canon, []);
      for (const iv of chain) incModel = incrementalApply(canon, incModel, iv);
      const refModel = buildModel(canon, chain);
      advTotal++;
      if (compareModels(incModel, refModel).length === 0) advPass++;
      else console.log(`  FAIL: edge add/sever/add`);
    }
  }

  // SCC witnesses (from S023/S024)
  {
    // genCanon with 0.6 probability of adding a cycle
    for (let seed = 1; seed <= 20; seed++) {
      const c = genCanon(seed);
      if (c.edges.length < 2) continue;
      // Check if there's a cycle
      const adj = new Map<string, string[]>();
      for (const e of c.edges) {
        if (e.kind === "REQUIRES") {
          const l = adj.get(e.from) ?? [];
          l.push(e.to);
          adj.set(e.from, l);
        }
      }
      // DFS for cycle
      let hasCycle = false;
      const visited = new Set<string>();
      const inStack = new Set<string>();
      const dfs = (n: string): void => {
        if (inStack.has(n)) { hasCycle = true; return; }
        if (visited.has(n)) return;
        visited.add(n);
        inStack.add(n);
        for (const next of adj.get(n) ?? []) dfs(next);
        inStack.delete(n);
      };
      for (const n of adj.keys()) dfs(n);
      if (!hasCycle) continue;

      const h = history(c, 10, 20260932 + seed * 104729);
      let incModel = buildModel(c, []);
      for (let i = 0; i < h.length; i++) {
        incModel = incrementalApply(c, incModel, h[i]!);
        const refModel = buildModel(c, h.slice(0, i + 1));
        advTotal++;
        if (compareModels(incModel, refModel).length === 0) advPass++;
        else console.log(`  FAIL: SCC seed=${seed} prefix=${i + 1}`);
      }
    }
  }

  console.log(`adversarial: ${advPass}/${advTotal} PASS`);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: future-equivalence test
// ═══════════════════════════════════════════════════════════════

console.log("\n=== S034 — Phase 4: future-equivalence ===\n");

{
  const canon = verrinCanon();
  let futTotal = 0, futPass = 0;

  for (let s = 0; s < 50; s++) {
    const h = history(canon, 30, 20261003 + s * 13337);
    // Build incremental model at prefix 15
    let incModel = buildModel(canon, []);
    for (let i = 0; i < 15; i++) incModel = incrementalApply(canon, incModel, h[i]!);
    const refModel = buildModel(canon, h.slice(0, 15));

    // Verify they match at prefix 15
    if (compareModels(incModel, refModel).length !== 0) {
      console.log(`  FAIL: pre-condition at seed=${s}`);
      continue;
    }

    // Apply suffix interventions to both
    let incSuffix = incModel;
    let refSuffix = refModel;
    for (let i = 15; i < 30; i++) {
      incSuffix = incrementalApply(canon, incSuffix, h[i]!);
      refSuffix = buildModel(canon, h.slice(0, i + 1));
      futTotal++;
      if (compareModels(incSuffix, refSuffix).length === 0 &&
          truthEqual(phaseATruth(incSuffix), phaseATruth(refSuffix), refSuffix.nodeIds)) {
        futPass++;
      } else {
        console.log(`  FAIL: future-equiv seed=${s} prefix=${i + 1}`);
      }
    }
  }
  console.log(`future-equivalence: ${futPass}/${futTotal} PASS`);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 5: lifecycle (determinism, branch, checkpoint)
// ═══════════════════════════════════════════════════════════════

console.log("\n=== S034 — Phase 5: lifecycle ===\n");

{
  const canon = verrinCanon();
  let lifeTotal = 0, lifePass = 0;

  // Rewind: incremental at H → rewind to K → continue
  for (let s = 0; s < 20; s++) {
    const h = history(canon, 30, 20261004 + s * 7919);
    let incModel = buildModel(canon, []);
    for (let i = 0; i < 30; i++) incModel = incrementalApply(canon, incModel, h[i]!);

    // "Rewind" to prefix 10: rebuild from scratch
    const rewindModel = buildModel(canon, h.slice(0, 10));
    // Continue from rewind point
    let contInc = rewindModel;
    for (let i = 10; i < 20; i++) contInc = incrementalApply(canon, contInc, h[i]!);
    // Fresh incremental of prefix 20
    let freshInc = buildModel(canon, []);
    for (let i = 0; i < 20; i++) freshInc = incrementalApply(canon, freshInc, h[i]!);

    lifeTotal++;
    if (compareModels(contInc, freshInc).length === 0) lifePass++;
    else console.log(`  FAIL: rewind seed=${s}`);
  }

  // Branch isolation: clone at H, divergent suffixes
  for (let s = 0; s < 20; s++) {
    const h1 = history(canon, 15, 20261005 + s * 3571);
    const h2 = history(canon, 15, 20261005 + s * 3571 + 100000);
    let incModel = buildModel(canon, []);
    for (let i = 0; i < 10; i++) incModel = incrementalApply(canon, incModel, h1[i]!);

    // Clone
    let branchA = incrementalApply(canon, incModel, h1[10]!);
    let branchB = incrementalApply(canon, incModel, h2[10]!);

    // Continue divergent
    for (let i = 11; i < 15; i++) branchA = incrementalApply(canon, branchA, h1[i]!);
    for (let i = 11; i < 15; i++) branchB = incrementalApply(canon, branchB, h2[i]!);

    // Verify no cross-contamination
    const refA = buildModel(canon, h1.slice(0, 15));
    const refB = buildModel(canon, [...h1.slice(0, 10), ...h2.slice(10, 15)]);

    lifeTotal++;
    const aOk = compareModels(branchA, refA).length === 0;
    const bOk = compareModels(branchB, refB).length === 0;
    if (aOk && bOk) lifePass++;
    else console.log(`  FAIL: branch seed=${s} a=${aOk} b=${bOk}`);
  }

  // Determinism: same inputs → same model
  for (let s = 0; s < 20; s++) {
    const h = history(canon, 20, 20261006 + s * 4999);
    let m1 = buildModel(canon, []);
    let m2 = buildModel(canon, []);
    for (let i = 0; i < h.length; i++) {
      m1 = incrementalApply(canon, m1, h[i]!);
      m2 = incrementalApply(canon, m2, h[i]!);
    }
    lifeTotal++;
    if (compareModels(m1, m2).length === 0) lifePass++;
    else console.log(`  FAIL: determinism seed=${s}`);
  }

  console.log(`lifecycle: ${lifePass}/${lifeTotal} PASS`);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 6: performance (three-way wall-clock)
// ═══════════════════════════════════════════════════════════════

console.log("\n=== S034 — Phase 6: performance (three-way) ===\n");

function workload(canon: Canon, h: number, seed: number, density: "sparse" | "medium" | "dense"): Intervention[] {
  if (density !== "sparse") return history(canon, h, seed);
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const out: Intervention[] = [];
  for (let k = 0; k < h; k++) out.push(k % 2 === 0 ? forceEvent(evs[k % evs.length]!, "r") : addEdge({ ...edges[k % edges.length]! }, "r"));
  return out;
}

console.log("density  H      REF-A(ms)  TARGET(ms)  A/T     proc   reset  model  model-update  phaseA");
for (const density of ["sparse", "medium", "dense"] as const) {
  for (const H of [100, 1000, 10000]) {
    const canon = verrinCanon();
    const h = workload(canon, H, 20261003, density);

    // REF-A: derive each prefix from scratch (buildModel + Phase-A)
    let tA = 0;
    for (let i = 0; i < h.length; i++) {
      const s = performance.now();
      const m = buildModel(canon, h.slice(0, i + 1));
      phaseATruth(m);
      tA += performance.now() - s;
    }

    // TARGET: incremental model + worklist Phase-A
    let incModel = buildModel(canon, []);
    let incTruth = phaseATruth(incModel);
    let tT = 0, tModel = 0, tPhaseA = 0, proc = 0, reset = 0;
    for (let i = 0; i < h.length; i++) {
      const s1 = performance.now();
      const prevModel = incModel;
      incModel = incrementalApply(canon, incModel, h[i]!);
      const s2 = performance.now();
      tModel += s2 - s1;

      const deps = depIndex(incModel);
      const resetSet = closure(directChanged(prevModel, incModel), deps);
      const truth = new Map<string, TruthValue>();
      for (const n of incModel.nodeIds) truth.set(n, resetSet.has(n) ? "NEITHER" : incTruth.get(n) ?? "NEITHER");
      const nodeSet = new Set(incModel.nodeIds);
      const queue: string[] = [...resetSet].filter((n) => nodeSet.has(n));
      const inQ = new Set<string>(queue);
      let p = 0;
      while (queue.length > 0) {
        const n = queue.shift()!;
        inQ.delete(n);
        p++;
        const next = nodeSupport(incModel, n, truth);
        if (next !== (truth.get(n) ?? "NEITHER")) {
          truth.set(n, next);
          for (const d of deps.get(n) ?? []) if (nodeSet.has(d) && !inQ.has(d)) { queue.push(d); inQ.add(d); }
        }
      }
      incTruth = truth;
      const s3 = performance.now();
      tPhaseA += s3 - s2;
      tT += s3 - s1;
      proc += p;
      reset += resetSet.size;
    }

    const model = incModel.nodeIds.length;
    console.log(
      `${density.padEnd(8)}${String(H).padEnd(7)}${tA.toFixed(0).padStart(9)}  ${tT.toFixed(0).padStart(10)}  ` +
        `${(tA / tT).toFixed(2).padStart(5)}  ${(proc / H).toFixed(2).padStart(5)}  ${(reset / H).toFixed(1).padStart(5)}  ` +
        `${model}  ${tModel.toFixed(0).padStart(11)}  ${tPhaseA.toFixed(0).padStart(7)}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 7: long-horizon (H=50k, 100k)
// ═══════════════════════════════════════════════════════════════

console.log("\n=== S034 — Phase 7: long-horizon ===\n");

{
  const canon = verrinCanon();
  for (const H of [50000, 100000]) {
    const h = workload(canon, H, 20261003, "sparse");

    // TARGET only (REF-A too slow at these horizons)
    let incModel = buildModel(canon, []);
    let incTruth = phaseATruth(incModel);
    const s0 = performance.now();
    let tModel = 0, tPhaseA = 0, proc = 0, reset = 0;
    for (let i = 0; i < h.length; i++) {
      const s1 = performance.now();
      const prevModel = incModel;
      incModel = incrementalApply(canon, incModel, h[i]!);
      const s2 = performance.now();
      tModel += s2 - s1;

      const deps = depIndex(incModel);
      const resetSet = closure(directChanged(prevModel, incModel), deps);
      const truth = new Map<string, TruthValue>();
      for (const n of incModel.nodeIds) truth.set(n, resetSet.has(n) ? "NEITHER" : incTruth.get(n) ?? "NEITHER");
      const nodeSet = new Set(incModel.nodeIds);
      const queue: string[] = [...resetSet].filter((n) => nodeSet.has(n));
      const inQ = new Set<string>(queue);
      let p = 0;
      while (queue.length > 0) {
        const n = queue.shift()!;
        inQ.delete(n);
        p++;
        const next = nodeSupport(incModel, n, truth);
        if (next !== (truth.get(n) ?? "NEITHER")) {
          truth.set(n, next);
          for (const d of deps.get(n) ?? []) if (nodeSet.has(d) && !inQ.has(d)) { queue.push(d); inQ.add(d); }
        }
      }
      incTruth = truth;
      const s3 = performance.now();
      tPhaseA += s3 - s2;
      proc += p;
      reset += resetSet.size;
    }
    const total = performance.now() - s0;
    const avgPerPrefix = total / H;
    console.log(`H=${H}  total=${total.toFixed(0)}ms  avg/prefix=${avgPerPrefix.toFixed(3)}ms  model=${tModel.toFixed(0)}ms  phaseA=${tPhaseA.toFixed(0)}ms  proc=${proc}  reset=${reset}  nodes=${incModel.nodeIds.length}`);
  }
}

console.log("\n=== S034 COMPLETE ===");
