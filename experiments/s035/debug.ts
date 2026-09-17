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
    const n = model.edges.length;
    model.edges = model.edges.filter((e: any) => e.id !== iv.target);
    edgeChanged = model.edges.length !== n;
  } else if (iv.kind === "addEdge") {
    const raw = iv.params?.edge;
    if (raw !== null && typeof raw === "object") {
      const edge = raw as any;
      if (typeof edge.id === "string" && typeof edge.kind === "string" && typeof edge.from === "string" && typeof edge.to === "string") {
        const guarded = { ...edge };
        if (typeof guarded.group !== "string") delete guarded.group;
        const prevEdge = model.edges.find((e: any) => e.id === guarded.id);
        const same = prevEdge !== undefined && canonicalJson(prevEdge) === canonicalJson(guarded);
        model.edges = model.edges.filter((e: any) => e.id !== guarded.id);
        model.edges.push(guarded);
        model.edges.sort(byId);
        edgeChanged = !same;
      }
    }
  }
  if (edgeChanged) rebuildDerived(model, canon);
  return model;
}

// Test: build from-scratch to prefix 10, compare with incremental
const canon = verrinCanon();
const h = history(canon, 30, 20261010 + 4 * 7919);

const ref10 = buildModel(canon, h.slice(0, 10));

let incModel = buildModel(canon, []);
for (let i = 0; i < 10; i++) {
  incModel = incrementalApply(canon, incModel, h[i]!);
}

// Compare all fields
const fields: [string, (a: any, b: any) => boolean][] = [
  ["nodeIds", (a, b) => JSON.stringify(a) === JSON.stringify(b)],
  ["declared", (a, b) => a.size === b.size && [...a].every((x: any) => b.has(x))],
  ["negated", (a, b) => a.size === b.size && [...a].every((x: any) => b.has(x))],
  ["forcedBy", (a, b) => a.size === b.size && [...a].every(([k, v]: any) => b.get(k) === v)],
  ["retracted", (a, b) => a.size === b.size && [...a].every((x: any) => b.has(x))],
  ["overriddenCells", (a, b) => a.size === b.size && [...a].every(([k, v]: any) => sameCanonicalValue(v, b.get(k)))],
  ["edges", (a, b) => a.length === b.length && a.every((e: any, i: number) => canonicalJson(e) === canonicalJson(b[i]))],
  ["supportGroups", (a, b) => a.size === b.size && [...a].every(([k, v]: any) => { const bv = b.get(k); return bv && JSON.stringify(v) === JSON.stringify(bv); })],
  ["enablesIn", (a, b) => a.size === b.size && [...a].every(([k, v]: any) => { const bv = b.get(k); return bv && JSON.stringify(v) === JSON.stringify(bv); })],
  ["precedesEdges", (a, b) => JSON.stringify(a) === JSON.stringify(b)],
  ["excludesEdges", (a, b) => JSON.stringify(a) === JSON.stringify(b)],
  ["invariantEdges", (a, b) => JSON.stringify(a) === JSON.stringify(b)],
  ["facts", (a, b) => a.size === b.size],
];

for (const [f, cmp] of fields) {
  const a = (incModel as any)[f];
  const b = (ref10 as any)[f];
  if (!cmp(a, b)) {
    console.log(`DIFFERS: ${f}`);
    if (f === "nodeIds") console.log(`  inc: ${a.length} ref: ${b.length}`);
    else if (f === "edges") console.log(`  inc: ${a.length} ref: ${b.length}`);
    else if (a instanceof Map || a instanceof Set) console.log(`  inc: ${a.size} ref: ${b.size}`);
    else console.log(`  inc: ${JSON.stringify(a).slice(0, 200)}`);
  }
}

// Also compare the iv at prefix 10 (what was the 10th intervention?)
console.log(`\niv at prefix 9: ${h[9]!.kind} target=${h[9]!.target}`);
console.log(`incModel has ${incModel.edges.length} edges, ref has ${ref10.edges.length} edges`);

// Check if the models differ after prefix 10
const ref11 = buildModel(canon, h.slice(0, 11));
const incAfter = incrementalApply(canon, incModel, h[10]!);
console.log(`\nAfter prefix 10 (h[10]):`);
console.log(`  incAfter edges: ${incAfter.edges.length}, ref11 edges: ${ref11.edges.length}`);
