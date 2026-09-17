import { verrinCanon } from "../../src/canon/verrin";
import { buildModel, phaseATruth, nodeSupport, cellKey, type DerivationModel, type SupportGroup } from "../../src/derive/propagation";
import { type TruthValue } from "../../src/derive/judgment";
import { canonicalJson, sameCanonicalValue } from "../../src/canon/hash";
import { buildFactVocabulary, factAssertionError } from "../../src/canon/fact-rules";
import { type Intervention, setFact, negateEvent, forceEvent, retractFact, severEdge, addEdge, relocate } from "../../src/timeline/types";

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function history(canon: any, h: number, seed: number): Intervention[] {
  const evs = canon.entities.filter((e: any) => e.kind === "Event").map((e: any) => e.id).sort();
  const ents = canon.entities.filter((e: any) => e.kind !== "Event" && e.kind !== "EventType").map((e: any) => e.id).sort();
  const preds = [...new Set(canon.facts.map((f: any) => f.predicate))].sort();
  const objs = [...new Set(canon.facts.map((f: any) => f.object))];
  const factIds = canon.facts.map((f: any) => f.id).sort();
  const edges = [...canon.edges].sort((a: any, b: any) => a.id.localeCompare(b.id));
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

function rebuildDerived(model: any, canon: any): void {
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
    model.supportGroups.set(target, [...groups.entries()].map(([group, conjuncts]) => ({ group, conjuncts: [...conjuncts].sort() })).sort((a, b) => a.group.localeCompare(b.group)));
  }
  model.enablesIn = new Map<string, string[]>();
  for (const edge of model.edges) { if (edge.kind === "ENABLES") { const list = model.enablesIn.get(edge.to) ?? []; list.push(edge.from); model.enablesIn.set(edge.to, list); } }
  for (const key of model.enablesIn.keys()) (model.enablesIn.get(key) ?? []).sort();
  model.precedesEdges = model.edges.filter((e: any) => e.kind === "PRECEDES");
  model.excludesEdges = model.edges.filter((e: any) => e.kind === "EXCLUDES");
  model.invariantEdges = model.edges.filter((e: any) => e.kind === "INVARIANT");
  model.declared = new Set<string>();
  for (const entity of canon.entities) { if (entity.kind === "Event") model.declared.add(entity.id); }
  for (const fact of canon.facts) model.declared.add(fact.id);
  const nodeSet = new Set<string>();
  for (const entity of canon.entities) { if (entity.kind === "Event") nodeSet.add(entity.id); }
  for (const edge of model.edges) { nodeSet.add(edge.from); nodeSet.add(edge.to); }
  for (const n of model.negated) nodeSet.add(n);
  for (const [k] of model.forcedBy) nodeSet.add(k);
  model.nodeIds = [...nodeSet].sort();
  const ns = new Set(model.nodeIds);
  model.facts = new Map<string, any>();
  for (const fact of canon.facts) { if (ns.has(fact.id)) model.facts.set(fact.id, fact); }
}

function incrementalApply(canon: any, prev: any, iv: any): any {
  const model: any = {
    nodeIds: [...prev.nodeIds], declared: new Set(prev.declared), factVocabulary: prev.factVocabulary,
    rejectedFactWrites: [...prev.rejectedFactWrites],
    supportGroups: new Map([...prev.supportGroups].map(([k, v]: any) => [k, v.map((g: any) => ({ ...g, conjuncts: [...g.conjuncts] }))])),
    enablesIn: new Map([...prev.enablesIn].map(([k, v]: any) => [k, [...v]])),
    precedesEdges: [...prev.precedesEdges], excludesEdges: [...prev.excludesEdges], invariantEdges: [...prev.invariantEdges],
    negated: new Set(prev.negated), forcedBy: new Map(prev.forcedBy), facts: new Map(prev.facts),
    retracted: new Set(prev.retracted), overriddenCells: new Map(prev.overriddenCells), edges: [...prev.edges],
  };
  let edgeChanged = false;
  if (iv.kind === "negateEvent") { if (!model.negated.has(iv.target)) model.negated.add(iv.target); }
  else if (iv.kind === "forceEvent") { model.forcedBy.set(iv.target, iv.id); }
  else if (iv.kind === "retractFact") { if (!model.retracted.has(iv.target)) model.retracted.add(iv.target); }
  else if (iv.kind === "setFact" || iv.kind === "relocate") {
    const predicate = iv.kind === "setFact" ? iv.params?.predicate : "located_in";
    const object = iv.kind === "setFact" ? iv.params?.object : iv.params?.to;
    if (typeof predicate === "string") {
      const value = (object ?? null) as string | number | boolean | null;
      const error = factAssertionError(iv.target, predicate, value, model.factVocabulary);
      if (error !== null) { model.rejectedFactWrites.push({ subject: iv.target, predicate, source: iv.id, error }); }
      else { const key = cellKey(iv.target, predicate); model.overriddenCells.set(key, value); }
    }
  } else if (iv.kind === "severEdge") {
    const n = model.edges.length; model.edges = model.edges.filter((e: any) => e.id !== iv.target); edgeChanged = model.edges.length !== n;
  } else if (iv.kind === "addEdge") {
    const raw = iv.params?.edge;
    if (raw !== null && typeof raw === "object") {
      const edge = raw as any;
      if (typeof edge.id === "string" && typeof edge.kind === "string" && typeof edge.from === "string" && typeof edge.to === "string") {
        const guarded = { ...edge }; if (typeof guarded.group !== "string") delete guarded.group;
        const prevEdge = model.edges.find((e: any) => e.id === guarded.id);
        const same = prevEdge !== undefined && canonicalJson(prevEdge) === canonicalJson(guarded);
        model.edges = model.edges.filter((e: any) => e.id !== guarded.id); model.edges.push(guarded); model.edges.sort(byId); edgeChanged = !same;
      }
    }
  }
  if (edgeChanged) rebuildDerived(model, canon);
  return model;
}

function depIndex(model: any): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (f: string, t: string) => { const l = out.get(f) ?? []; l.push(t); out.set(f, l); };
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
function directChanged(a: any, b: any): string[] {
  const out = new Set<string>();
  for (const n of a.negated) if (!b.negated.has(n)) out.add(n);
  for (const n of b.negated) if (!a.negated.has(n)) out.add(n);
  for (const n of a.retracted) if (!b.retracted.has(n)) out.add(n);
  for (const n of b.retracted) if (!a.retracted.has(n)) out.add(n);
  for (const k of new Set([...a.forcedBy.keys(), ...b.forcedBy.keys()])) if (a.forcedBy.get(k) !== b.forcedBy.get(k)) out.add(k);
  for (const k of new Set([...a.overriddenCells.keys(), ...b.overriddenCells.keys()])) {
    if (canonicalJson(a.overriddenCells.get(k)) !== canonicalJson(b.overriddenCells.get(k))) {
      out.add(`cell:${k}`);
      try { const [s, p] = JSON.parse(k); for (const f of [...a.facts.values(), ...b.facts.values()]) if (f.subject === s && f.predicate === p) out.add(f.id); } catch {}
    }
  }
  const ae = new Map(a.edges.map((e: any) => [e.id, e])); const be = new Map(b.edges.map((e: any) => [e.id, e]));
  for (const id of new Set([...ae.keys(), ...be.keys()])) {
    if (canonicalJson(ae.get(id)) !== canonicalJson(be.get(id))) { for (const e of [ae.get(id), be.get(id)]) if (e !== undefined) { out.add(e.from); out.add(e.to); } }
  }
  const an = new Set(a.nodeIds); const bn = new Set(b.nodeIds);
  for (const n of an) if (!bn.has(n)) out.add(n);
  for (const n of bn) if (!an.has(n)) out.add(n);
  return [...out];
}
function closure(seed: Iterable<string>, d: Map<string, string[]>): Set<string> {
  const seen = new Set<string>(); const q = [...seed];
  while (q.length) { const n = q.pop()!; if (seen.has(n)) continue; seen.add(n); for (const x of d.get(n) ?? []) if (!seen.has(x)) q.push(x); }
  return seen;
}

interface Exec { model: any; truth: Map<string, TruthValue> }
function stepIncremental(canon: any, prev: Exec, iv: any): Exec {
  const model = incrementalApply(canon, prev.model, iv);
  const deps = depIndex(model);
  const reset = closure(directChanged(prev.model, model), deps);
  const truth = new Map<string, TruthValue>();
  for (const n of model.nodeIds) truth.set(n, reset.has(n) ? "NEITHER" : prev.truth.get(n) ?? "NEITHER");
  const nodeSet = new Set(model.nodeIds);
  const queue: string[] = [...reset].filter((n) => nodeSet.has(n));
  const inQ = new Set<string>(queue);
  while (queue.length > 0) {
    const n = queue.shift()!; inQ.delete(n);
    const next = nodeSupport(model, n, truth);
    if (next !== (truth.get(n) ?? "NEITHER")) {
      truth.set(n, next);
      for (const d of deps.get(n) ?? []) if (nodeSet.has(d) && !inQ.has(d)) { queue.push(d); inQ.add(d); }
    }
  }
  return { model, truth };
}

// Serialize
function serialize(model: any) {
  return { version: "s035.1", nodeIds: [...model.nodeIds], declared: [...model.declared], negated: [...model.negated],
    retracted: [...model.retracted], forcedBy: [...model.forcedBy], overriddenCells: [...model.overriddenCells],
    edges: model.edges.map((e: any) => ({ ...e })) };
}
function restore(canon: any, state: any) {
  const model = buildModel(canon, []);
  model.nodeIds = [...state.nodeIds]; model.declared = new Set(state.declared);
  model.negated = new Set(state.negated); model.retracted = new Set(state.retracted);
  model.forcedBy = new Map(state.forcedBy); model.overriddenCells = new Map(state.overriddenCells);
  model.edges = state.edges.map((e: any) => ({ ...e })); model.edges.sort(byId);
  model.factVocabulary = buildFactVocabulary(canon);
  rebuildDerived(model, canon);
  model.rejectedFactWrites = [];
  return model;
}

function compareModels(a: any, b: any): string[] {
  const m: string[] = [];
  if (a.nodeIds.length !== b.nodeIds.length) m.push("nodeIds.len");
  else { for (let i = 0; i < a.nodeIds.length; i++) { if (a.nodeIds[i] !== b.nodeIds[i]) { m.push("nodeIds[" + i + "]"); break; } } }
  if (a.edges.length !== b.edges.length) m.push("edges.len");
  else { for (let i = 0; i < a.edges.length; i++) { if (canonicalJson(a.edges[i]) !== canonicalJson(b.edges[i])) { m.push("edges[" + i + "]"); break; } } }
  if (a.negated.size !== b.negated.size) m.push("negated.size");
  if (a.forcedBy.size !== b.forcedBy.size) m.push("forcedBy.size");
  if (a.overriddenCells.size !== b.overriddenCells.size) m.push("overriddenCells.size");
  if (a.supportGroups.size !== b.supportGroups.size) m.push("supportGroups.size");
  if (a.declared.size !== b.declared.size) m.push("declared.size");
  return m;
}

// Reproduce lifecycle rewind test seed=4
const canon = verrinCanon();
const s = 4;
const h = history(canon, 30, 20261010 + s * 7919);

// Path A: incremental to 30
let execA: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
for (let i = 0; i < 30; i++) execA = stepIncremental(canon, execA, h[i]!);

// Path B: checkpoint at 10, continue to 20
let execB: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
for (let i = 0; i < 10; i++) execB = stepIncremental(canon, execB, h[i]!);
const snap = serialize(execB.model);

// Rewind
const rwModel = restore(canon, snap);
const rwTruth = phaseATruth(rwModel);
let rwExec: Exec = { model: rwModel, truth: rwTruth };
for (let i = 10; i < 20; i++) rwExec = stepIncremental(canon, rwExec, h[i]!);

// Reference: incremental from scratch to 20
let refExec: Exec = { model: buildModel(canon, []), truth: phaseATruth(buildModel(canon, [])) };
for (let i = 0; i < 20; i++) refExec = stepIncremental(canon, refExec, h[i]!);

console.log("rw model vs ref model:", compareModels(rwExec.model, refExec.model));
console.log("rw model vs A model (at 30):", compareModels(rwExec.model, execA.model));
console.log("rw model vs B model (at 30):", compareModels(execB.model, execA.model));

// Check: does B.model match A.model at prefix 30?
console.log("\nexecB.model vs execA.model:", compareModels(execB.model, execA.model));
