/**
 * S032 — Minimise and characterise the 5 failing S024 synthetic topologies.
 *
 * Reproduce the S031 failures, print the first divergent prefix, the divergent
 * nodes, and the authoritative reads of each — to identify the missing dependency.
 */
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

function initState(canon: Canon, H: Intervention[]): Exec {
  const model = buildModel(canon, H);
  return { model, truth: phaseATruth(model) };
}

function step(canon: Canon, prev: Exec, H: Intervention[]): Exec {
  const model = buildModel(canon, H);
  const deps = depIndex(model);
  // S032 FIX: reset the DEPENDENCY CLOSURE to NEITHER and seed the queue with it.
  // S030 seeded only directChanged and carried the previous truth, so a stale
  // value on a closure node that was not itself directly changed survived.
  const reset = closure(directChanged(prev.model, model), deps);
  const truth = new Map<string, TruthValue>();
  for (const n of model.nodeIds) truth.set(n, reset.has(n) ? "NEITHER" : prev.truth.get(n) ?? "NEITHER");
  const nodeSet = new Set(model.nodeIds);
  const queue: string[] = [...reset].filter((n) => nodeSet.has(n));
  const inQ = new Set<string>(queue);
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

function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

console.log("=== S032 — trace the 5 failing S024 topologies ===\n");
let failures = 0;
for (let seed = 1; seed <= 100; seed++) {
  const canon = genCanon(seed);
  const H = history(canon, 15, 20260932 + seed * 104729);
  let inc = initState(canon, []);
  let found = false;
  for (let i = 0; i < H.length && !found; i++) {
    const prev = inc;
    inc = step(canon, inc, H.slice(0, i + 1));
    const ref = phaseATruth(inc.model);
    const diff = inc.model.nodeIds.filter((n) => (ref.get(n) ?? "NEITHER") !== (inc.truth.get(n) ?? "NEITHER"));
    if (diff.length > 0) {
      found = true;
      failures++;
      console.log(`--- FAIL seed=${seed} prefix=${i + 1} iv=${H[i]!.kind}:${H[i]!.target}`);
      const dc = directChanged(prev.model, inc.model);
      const cl = closure(dc, depIndex(inc.model));
      console.log(`   directChanged=[${dc.join(",")}]`);
      console.log(`   closure(${cl.size})=[${[...cl].sort().join(",")}]`);
      for (const n of diff) {
        console.log(`   DIVERGENT ${n}: ref=${ref.get(n)} inc=${inc.truth.get(n)} inClosure=${cl.has(n)}`);
        const groups = inc.model.supportGroups.get(n);
        const fact = inc.model.facts.get(n);
        if (fact !== undefined) {
          console.log(`      FACT cell=${cellKey(fact.subject, fact.predicate)} retracted=${inc.model.retracted.has(n)} overridden=${inc.model.overriddenCells.has(cellKey(fact.subject, fact.predicate))} validFrom=${fact.validFrom} validTo=${fact.validTo}`);
        }
        if (groups !== undefined) {
          for (const g of groups) console.log(`      group ${g.group}: [${g.conjuncts.map((c) => `${c}=${ref.get(c)}`).join(", ")}]`);
        } else if (fact === undefined) {
          console.log(`      no groups; negated=${inc.model.negated.has(n)} forced=${inc.model.forcedBy.has(n)} declared=${inc.model.declared.has(n)}`);
        }
      }
    }
  }
}
console.log(`\ntotal failing topologies=${failures}`);
