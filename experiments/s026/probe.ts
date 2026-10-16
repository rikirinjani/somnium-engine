/**
 * S026 — Phase-A Reconsideration Semantics.
 *
 * Reproduce the S025 first divergence (ordos, seed 0, prefix 5,
 * negateEvent:ev/vaela-invested), identify the nodes that changed OUTSIDE the
 * reset closure, and characterize WHY the from-scratch fixpoint re-decides them.
 *
 * Observation only. No incremental engine.
 */
import { ordosCanon } from "../../src/canon/ordos";
import { verrinCanon } from "../../src/canon/verrin";
import type { Canon } from "../../src/canon/types";
import { buildModel, phaseATruth, type DerivationModel } from "../../src/derive/propagation";
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

function dependents(model: DerivationModel): Map<string, string[]> {
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

function directChanged(a: DerivationModel, b: DerivationModel): string[] {
  const out = new Set<string>();
  for (const n of a.negated) if (!b.negated.has(n)) out.add(n);
  for (const n of b.negated) if (!a.negated.has(n)) out.add(n);
  for (const n of a.retracted) if (!b.retracted.has(n)) out.add(n);
  for (const n of b.retracted) if (!a.retracted.has(n)) out.add(n);
  for (const k of new Set([...a.forcedBy.keys(), ...b.forcedBy.keys()])) if (a.forcedBy.get(k) !== b.forcedBy.get(k)) out.add(k);
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

// --- Phase 3: reproduce the S025 first divergence (ordos, seed 0, prefix 5) ---
console.log("=== S026 — reproduce S025 first divergence ===\n");
{
  const canon = ordosCanon();
  const H = history(canon, 20, 20260928);
  let prevModel = buildModel(canon, []);
  let incTruth = phaseATruth(prevModel);
  for (let i = 0; i < 5; i++) {
    const model = buildModel(canon, H.slice(0, i + 1));
    const ref = phaseATruth(model);
    const changed = directChanged(prevModel, model);
    const reset = closure(changed, dependents(model));
    const seed = new Map<string, TruthValue>();
    for (const n of model.nodeIds) seed.set(n, reset.has(n) ? "NEITHER" : incTruth.get(n) ?? "NEITHER");
    const cand = phaseATruth(model, seed);
    if (i === 4) {
      console.log(`prefix=${i + 1} iv=${H[i]!.kind}:${H[i]!.target}`);
      console.log(`directChanged=[${changed.join(",")}]`);
      console.log(`reset closure (${reset.size})=[${[...reset].sort().join(",")}]`);
      const diff = model.nodeIds.filter((n) => (ref.get(n) ?? "NEITHER") !== (cand.get(n) ?? "NEITHER"));
      console.log(`divergent nodes (${diff.length}):`);
      for (const n of diff) {
        console.log(`   ${n}: ref=${ref.get(n)} cand=${cand.get(n)} prev=${incTruth.get(n)} inClosure=${reset.has(n)}`);
        // why? show the node's support groups and their conjuncts' ref values
        const groups = model.supportGroups.get(n);
        if (groups !== undefined) {
          for (const g of groups) {
            console.log(`      group ${g.group}: conjuncts=[${g.conjuncts.map((c) => `${c}:${ref.get(c)}`).join(", ")}]`);
          }
        } else {
          console.log(`      (no support groups; negated=${model.negated.has(n)} forced=${model.forcedBy.has(n)})`);
        }
      }
    }
    prevModel = model;
    incTruth = cand;
  }
}

// --- Phase 10/14: R vs closure over randomized histories ---
console.log("\n=== R (re-evaluated) vs closure — randomized ===\n");
let prefixes = 0;
let rOutsideClosure = 0;
let maxOutside = 0;
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  for (let s = 0; s < 20; s++) {
    const H = history(canon, 20, 20260928 + s * 104729);
    let prevModel = buildModel(canon, []);
    let prevTruth = phaseATruth(prevModel);
    for (let i = 0; i < H.length; i++) {
      const model = buildModel(canon, H.slice(0, i + 1));
      const ref = phaseATruth(model);
      // R = nodes whose JUDGMENT actually changed from the previous prefix
      const R = model.nodeIds.filter((n) => (ref.get(n) ?? "NEITHER") !== (prevTruth.get(n) ?? "NEITHER"));
      const reset = closure(directChanged(prevModel, model), dependents(model));
      const outside = R.filter((n) => !reset.has(n));
      prefixes++;
      rOutsideClosure += outside.length;
      maxOutside = Math.max(maxOutside, outside.length);
      prevModel = model;
      prevTruth = ref;
    }
  }
}
console.log(`prefixes=${prefixes}  total |R \\ closure|=${rOutsideClosure}  max per prefix=${maxOutside}`);
