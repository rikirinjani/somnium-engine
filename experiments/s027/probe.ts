/**
 * S027 — Validity-Window Dependency / Reconsideration Boundary Validation.
 *
 * V0: old closure + old scheduling          (S025 behaviour)
 * V1: validity-window-aware closure + old scheduling
 * V2: old closure + corrected scheduling
 * V3: validity-window-aware closure + corrected scheduling
 *
 * "Corrected scheduling" = reset the closure to NEITHER and re-evaluate to a
 * fixpoint via the AUTHORITATIVE positiveFixpoint (the reset makes every
 * affected node re-evaluable; the sticky rule then cannot skip a stale node).
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

function baseDeps(model: DerivationModel): Map<string, string[]> {
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

/** S026's missing class: fact validity-window edges (validFrom/validTo -> fact node) */
function addValidityWindowDeps(model: DerivationModel, deps: Map<string, string[]>): void {
  for (const fact of model.facts.values()) {
    if (fact.validFrom !== null) {
      const l = deps.get(fact.validFrom) ?? [];
      l.push(fact.id);
      deps.set(fact.validFrom, l);
    }
    if (fact.validTo !== null) {
      const l = deps.get(fact.validTo) ?? [];
      l.push(fact.id);
      deps.set(fact.validTo, l);
    }
  }
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

function runVariant(canon: Canon, validityAware: boolean): { prefixes: number; mismatch: number; rOutside: number } {
  let prefixes = 0;
  let mismatch = 0;
  let rOutside = 0;
  for (let s = 0; s < 20; s++) {
    const H = history(canon, 20, 20260928 + s * 104729);
    let prevModel = buildModel(canon, []);
    let incTruth = phaseATruth(prevModel);
    for (let i = 0; i < H.length; i++) {
      const model = buildModel(canon, H.slice(0, i + 1));
      const ref = phaseATruth(model);
      const deps = baseDeps(model);
      if (validityAware) addValidityWindowDeps(model, deps);
      const reset = closure(directChanged(prevModel, model), deps);
      const seed = new Map<string, TruthValue>();
      for (const n of model.nodeIds) seed.set(n, reset.has(n) ? "NEITHER" : incTruth.get(n) ?? "NEITHER");
      const cand = phaseATruth(model, seed);
      prefixes++;
      let d = 0;
      for (const n of model.nodeIds) if ((ref.get(n) ?? "NEITHER") !== (cand.get(n) ?? "NEITHER")) d++;
      if (d > 0) mismatch++;
      const R = model.nodeIds.filter((n) => (ref.get(n) ?? "NEITHER") !== (incTruth.get(n) ?? "NEITHER"));
      rOutside += R.filter((n) => !reset.has(n)).length;
      prevModel = model;
      incTruth = cand;
    }
  }
  return { prefixes, mismatch, rOutside };
}

console.log("=== S027 — V0/V1/V2/V3 decomposition ===\n");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const v0 = runVariant(canon, false);
  const v1 = runVariant(canon, true);
  console.log(`--- ${name} ---`);
  console.log(`  V0 (old closure)      prefixes=${v0.prefixes} mismatch=${v0.mismatch} R\\closure=${v0.rOutside}`);
  console.log(`  V1 (validity-aware)   prefixes=${v1.prefixes} mismatch=${v1.mismatch} R\\closure=${v1.rOutside}`);
}
console.log("\n[NOTE] V2/V3 differ from V0/V1 only in scheduling; here the reset-to-NEITHER");
console.log("       already makes every affected node re-evaluable, so V1 IS the corrected-scheduling V3.");
