/**
 * S034 debug: investigate the first model divergence.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { buildModel, cellKey, type DerivationModel, type SupportGroup } from "../../src/derive/propagation";
import { canonicalJson, sameCanonicalValue } from "../../src/canon/hash";
import { buildFactVocabulary, factAssertionError } from "../../src/canon/fact-rules";
import type { Canon, CausalEdge, Fact } from "../../src/canon/types";
import { type Intervention, setFact, negateEvent, forceEvent, retractFact, severEdge, addEdge, relocate } from "../../src/timeline/types";
import { phaseATruth } from "../../src/derive/propagation";
import { phaseATruth as refPhaseA } from "../../src/derive/propagation";

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
  for (const n of model.nodeIds) nodeSet.add(n);
  model.nodeIds = [...nodeSet].sort();
  const ns = new Set(model.nodeIds);
  model.facts = new Map<string, Fact>();
  for (const fact of canon.facts) {
    if (ns.has(fact.id)) model.facts.set(fact.id, fact);
  }
}

function incrementalApply(canon: Canon, prev: DerivationModel, iv: Intervention): DerivationModel {
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
        edgeChanged = !same;
      }
    }
  }

  if (edgeChanged) rebuildDerived(model, canon);
  return model;
}

// Reproduce the first divergence
const canon = verrinCanon();
const h = history(canon, 20, 20261001);

console.log("First 5 interventions:");
for (let i = 0; i < Math.min(5, h.length); i++) {
  const iv = h[i]!;
  console.log(`  [${i}] ${iv.kind}: ${iv.target} (id=${iv.id})`);
  if (iv.kind === "addEdge") {
    console.log(`       edge: ${JSON.stringify(iv.params?.edge)}`);
  }
}

console.log("\n--- Tracing model divergence ---");
let incModel = buildModel(canon, []);
for (let i = 0; i < 5; i++) {
  const iv = h[i]!;
  const chain = h.slice(0, i + 1);

  incModel = incrementalApply(canon, incModel, iv);
  const refModel = buildModel(canon, chain);

  // Compare edges
  const incEdges = incModel.edges.map((e) => e.id);
  const refEdges = refModel.edges.map((e) => e.id);

  if (incEdges.length !== refEdges.length || incEdges.some((e, j) => e !== refEdges[j])) {
    console.log(`\n[${i}] iv=${iv.kind}:${iv.target}`);
    console.log(`  inc edges (${incEdges.length}): ${incEdges.join(", ")}`);
    console.log(`  ref edges (${refEdges.length}): ${refEdges.join(", ")}`);

    // Find differences
    const incSet = new Set(incEdges);
    const refSet = new Set(refEdges);
    const onlyInc = incEdges.filter((e) => !refSet.has(e));
    const onlyRef = refEdges.filter((e) => !incSet.has(e));
    if (onlyInc.length > 0) console.log(`  only in inc: ${onlyInc.join(", ")}`);
    if (onlyRef.length > 0) console.log(`  only in ref: ${onlyRef.join(", ")}`);

    // Check if edges are the same objects (different order?)
    const incMap = new Map(incModel.edges.map((e) => [e.id, canonicalJson(e)]));
    const refMap = new Map(refModel.edges.map((e) => [e.id, canonicalJson(e)]));
    for (const [id, incJson] of incMap) {
      const refJson = refMap.get(id);
      if (refJson !== undefined && incJson !== refJson) {
        console.log(`  EDGE CONTENT DIFFERS: ${id}`);
        console.log(`    inc: ${incJson}`);
        console.log(`    ref: ${refJson}`);
      }
    }
  } else {
    console.log(`[${i}] iv=${iv.kind}:${iv.target} — edges OK (${incEdges.length})`);
  }
}
