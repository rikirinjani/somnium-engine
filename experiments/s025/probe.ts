/**
 * S025 — Incremental Phase-A Fixpoint Equivalence.
 *
 * Shadow engine: reset the affected dependency closure to NEITHER, then call the
 * AUTHORITATIVE seeded Phase A. Compare against the from-scratch reference at
 * EVERY prefix. No semantic rule is reimplemented.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
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

/** directly changed nodes between two models (accumulator + edge deltas) */
function directChanged(a: DerivationModel, b: DerivationModel): string[] {
  const out = new Set<string>();
  for (const n of a.negated) if (!b.negated.has(n)) out.add(n);
  for (const n of b.negated) if (!a.negated.has(n)) out.add(n);
  for (const n of a.retracted) if (!b.retracted.has(n)) out.add(n);
  for (const n of b.retracted) if (!a.retracted.has(n)) out.add(n);
  for (const k of new Set([...a.forcedBy.keys(), ...b.forcedBy.keys()])) if (a.forcedBy.get(k) !== b.forcedBy.get(k)) out.add(k);
  for (const k of new Set([...a.overriddenCells.keys(), ...b.overriddenCells.keys()])) {
    if (canonicalJson(a.overriddenCells.get(k)) !== canonicalJson(b.overriddenCells.get(k))) {
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
  // node-set changes
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

function cmp(a: Map<string, TruthValue>, b: Map<string, TruthValue>, nodes: string[]): number {
  let d = 0;
  for (const n of nodes) if ((a.get(n) ?? "NEITHER") !== (b.get(n) ?? "NEITHER")) d++;
  return d;
}

console.log("=== S025 — incremental Phase A vs from-scratch reference ===\n");
let prefixes = 0;
let mismatchPrefixes = 0;
let firstDivergence: string | null = null;

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  for (let s = 0; s < 20; s++) {
    const H = history(canon, 20, 20260928 + s * 104729);
    let prevModel = buildModel(canon, []);
    let incTruth = phaseATruth(prevModel); // authoritative Phase A of the empty prefix
    for (let i = 0; i < H.length; i++) {
      const model = buildModel(canon, H.slice(0, i + 1));
      const ref = phaseATruth(model);
      // incremental: reset the affected closure to NEITHER, seed the rest from prior
      const changed = directChanged(prevModel, model);
      const reset = closure(changed, dependents(model));
      const seed = new Map<string, TruthValue>();
      for (const n of model.nodeIds) seed.set(n, reset.has(n) ? "NEITHER" : incTruth.get(n) ?? "NEITHER");
      const cand = phaseATruth(model, seed);
      prefixes++;
      const d = cmp(ref, cand, model.nodeIds);
      if (d > 0) {
        mismatchPrefixes++;
        if (firstDivergence === null) firstDivergence = `${name} seed=${s} prefix=${i + 1} iv=${H[i]!.kind}:${H[i]!.target} mismatchedNodes=${d} reset=${reset.size}`;
      }
      prevModel = model;
      incTruth = cand;
    }
  }
}

console.log(`prefixes=${prefixes} mismatched=${mismatchPrefixes} (${((mismatchPrefixes / prefixes) * 100).toFixed(1)}%)`);
if (firstDivergence) console.log(`first divergence: ${firstDivergence}`);
console.log(`\n[EQUIVALENT] incremental Phase A === reference ? ${mismatchPrefixes === 0}`);
