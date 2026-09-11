/**
 * S028 — Authoritative Phase-A Dependency Completeness Audit.
 *
 * Focused residual analysis: find a remaining Ordos divergence under the
 * S027 validity-window-aware closure and trace WHY the node changed.
 */
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, phaseATruth, cellKey, type DerivationModel } from "../../src/derive/propagation";
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

function deps(model: DerivationModel, opts: { validity: boolean; override: boolean; retracted: boolean }): Map<string, string[]> {
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
  if (opts.validity) {
    for (const fact of model.facts.values()) {
      if (fact.validFrom !== null) add(fact.validFrom, fact.id);
      if (fact.validTo !== null) add(fact.validTo, fact.id);
    }
  }
  if (opts.override) {
    // a cell override affects every fact whose (subject,predicate) is that cell
    for (const fact of model.facts.values()) add(`cell:${cellKey(fact.subject, fact.predicate)}`, fact.id);
  }
  if (opts.retracted) {
    // retracting a fact affects that fact node (already in directChanged) and,
    // via the cell, no others; recorded here for completeness
    for (const fid of model.retracted) add(`retract:${fid}`, fid);
  }
  return out;
}

function directChanged(a: DerivationModel, b: DerivationModel, opts: { override: boolean; retracted: boolean }): string[] {
  const out = new Set<string>();
  for (const n of a.negated) if (!b.negated.has(n)) out.add(n);
  for (const n of b.negated) if (!a.negated.has(n)) out.add(n);
  for (const n of a.retracted) if (!b.retracted.has(n)) { out.add(n); if (opts.retracted) out.add(`retract:${n}`); }
  for (const n of b.retracted) if (!a.retracted.has(n)) { out.add(n); if (opts.retracted) out.add(`retract:${n}`); }
  for (const k of new Set([...a.forcedBy.keys(), ...b.forcedBy.keys()])) if (a.forcedBy.get(k) !== b.forcedBy.get(k)) out.add(k);
  for (const k of new Set([...a.overriddenCells.keys(), ...b.overriddenCells.keys()])) {
    if (canonicalJson(a.overriddenCells.get(k)) !== canonicalJson(b.overriddenCells.get(k))) {
      if (opts.override) out.add(`cell:${k}`);
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

function runVariant(canon: Canon, opts: { validity: boolean; override: boolean; retracted: boolean }, trace: boolean): { mismatch: number; rOutside: number } {
  let mismatch = 0;
  let rOutside = 0;
  let traced = false;
  for (let s = 0; s < 20; s++) {
    const H = history(canon, 20, 20260928 + s * 104729);
    let prevModel = buildModel(canon, []);
    let incTruth = phaseATruth(prevModel);
    for (let i = 0; i < H.length; i++) {
      const model = buildModel(canon, H.slice(0, i + 1));
      const ref = phaseATruth(model);
      const d = deps(model, opts);
      const reset = closure(directChanged(prevModel, model, opts), d);
      const seed = new Map<string, TruthValue>();
      for (const n of model.nodeIds) seed.set(n, reset.has(n) ? "NEITHER" : incTruth.get(n) ?? "NEITHER");
      const cand = phaseATruth(model, seed);
      const diff = model.nodeIds.filter((n) => (ref.get(n) ?? "NEITHER") !== (cand.get(n) ?? "NEITHER"));
      if (diff.length > 0) {
        mismatch++;
        if (trace && !traced) {
          traced = true;
          console.log(`  RESIDUAL: seed=${s} prefix=${i + 1} iv=${H[i]!.kind}:${H[i]!.target}`);
          console.log(`    directChanged=[${directChanged(prevModel, model, opts).join(",")}]`);
          for (const n of diff.slice(0, 4)) {
            console.log(`    node ${n}: ref=${ref.get(n)} cand=${cand.get(n)} prev=${incTruth.get(n)} inClosure=${reset.has(n)}`);
            const groups = model.supportGroups.get(n);
            const fact = model.facts.get(n);
            if (fact !== undefined) {
              console.log(`      FACT cell=${cellKey(fact.subject, fact.predicate)} retracted=${model.retracted.has(n)} overridden=${model.overriddenCells.has(cellKey(fact.subject, fact.predicate))} validFrom=${fact.validFrom} validTo=${fact.validTo}`);
            }
            if (groups !== undefined) for (const g of groups) console.log(`      group ${g.group}: [${g.conjuncts.map((c) => `${c}=${ref.get(c)}`).join(", ")}]`);
          }
        }
      }
      const R = model.nodeIds.filter((n) => (ref.get(n) ?? "NEITHER") !== (incTruth.get(n) ?? "NEITHER"));
      rOutside += R.filter((n) => !reset.has(n)).length;
      prevModel = model;
      incTruth = cand;
    }
  }
  return { mismatch, rOutside };
}

console.log("=== S028 — dependency class attribution (ordos) ===\n");
const canon = ordosCanon();
const variants: [string, { validity: boolean; override: boolean; retracted: boolean }][] = [
  ["V1 validity", { validity: true, override: false, retracted: false }],
  ["V2 validity+override", { validity: true, override: true, retracted: false }],
  ["V3 validity+retracted", { validity: true, override: false, retracted: true }],
  ["V5 validity+override+retracted", { validity: true, override: true, retracted: true }],
];
for (const [name, o] of variants) {
  const r = runVariant(canon, o, name === "V5 validity+override+retracted");
  console.log(`${name.padEnd(34)} mismatch=${r.mismatch} R\\closure=${r.rOutside}`);
}
