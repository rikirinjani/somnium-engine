/**
 * S016 — propagation observability probe.
 *
 * For each intervention, compare the S015 reverse-dependency closure against the
 * AUTHORITATIVE propagation footprint (Phase A + Phase B considered/recomputed/
 * changed).
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import {
  buildModel,
  propagateJudgmentsWithFootprint,
  type DerivationModel,
} from "../../src/derive/propagation";
import { canonicalJson } from "../../src/canon/hash";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";

function dependents(model: DerivationModel): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const l = out.get(from) ?? [];
    l.push(to);
    out.set(from, l);
  };
  for (const [target, groups] of model.supportGroups) for (const g of groups) for (const c of g.conjuncts) add(c, target);
  for (const [target, sources] of model.enablesIn) for (const s of sources) add(s, target);
  for (const e of model.excludesEdges) { add(e.from, e.to); add(e.to, e.from); }
  for (const e of model.invariantEdges) add(e.from, e.to);
  for (const e of model.precedesEdges) { add(e.from, e.to); add(e.to, e.from); }
  return out;
}

function closure(seed: string[], deps: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const q = [...seed];
  while (q.length > 0) {
    const n = q.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of deps.get(n) ?? []) if (!seen.has(d)) q.push(d);
  }
  return seen;
}

function directDelta(a: DerivationModel, b: DerivationModel): string[] {
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
        out.add(`derived:${k}`);
      } catch { /* ignore */ }
    }
  }
  const ae = new Set(a.edges.map((e) => e.id));
  const be = new Set(b.edges.map((e) => e.id));
  for (const id of ae) if (!be.has(id)) out.add(id);
  for (const id of be) if (!ae.has(id)) out.add(id);
  return [...out];
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
    if (roll < 0.4 && ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), objs.length > 0 ? pick(objs) : true, "r"));
    else if (roll < 0.55 && evs.length > 0) out.push(negateEvent(pick(evs), "r"));
    else if (roll < 0.7 && evs.length > 0) out.push(forceEvent(pick(evs), "r"));
    else if (roll < 0.82 && factIds.length > 0) out.push(retractFact(pick(factIds), "r"));
    else if (roll < 0.92 && edges.length > 0) out.push(severEdge(pick(edges).id, "r"));
    else if (edges.length > 0) out.push(addEdge({ ...pick(edges) }, "r"));
  }
  return out;
}

console.log("=== S016 — reference re-evaluation footprint vs S015 closure ===\n");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260921);
  const byKind: Record<string, { n: number; Acons: number; Arecomp: number; Achanged: number; Bcons: number; Brecomp: number; Bchanged: number; closure: number; missed: number; iters: number; total: number }> = {};
  let total = 0;
  for (let i = 0; i < H.length; i++) {
    const before = buildModel(canon, H.slice(0, i));
    const after = buildModel(canon, H.slice(0, i + 1));
    total = after.nodeIds.length;
    const fp = propagateJudgmentsWithFootprint(after).footprint;
    const pred = closure(directDelta(before, after), dependents(after));
    const changed = new Set([...fp.phaseA.changedNodes, ...fp.phaseB.changedNodes]);
    let missed = 0;
    for (const n of changed) if (!pred.has(n)) missed++;
    const k = H[i]!.kind;
    const r = (byKind[k] ??= { n: 0, Acons: 0, Arecomp: 0, Achanged: 0, Bcons: 0, Brecomp: 0, Bchanged: 0, closure: 0, missed: 0, iters: 0, total: 0 });
    r.n++;
    r.Acons += fp.phaseA.considered;
    r.Arecomp += fp.phaseA.recomputed;
    r.Achanged += fp.phaseA.changed;
    r.Bcons += fp.phaseB.considered;
    r.Brecomp += fp.phaseB.recomputed;
    r.Bchanged += fp.phaseB.changed;
    r.closure += pred.size;
    r.missed += missed;
    r.iters += fp.phaseA.iterations;
    r.total = after.nodeIds.length;
  }
  console.log(`--- ${name} (model nodes=${total}) ---`);
  console.log("  kind         n   A.cons A.recomp A.chg  B.cons B.recomp B.chg  closure  missed  A.iters");
  for (const [k, r] of Object.entries(byKind)) {
    console.log(
      `  ${k.padEnd(12)}${String(r.n).padStart(3)}  ${(r.Acons / r.n).toFixed(0).padStart(6)} ${(r.Arecomp / r.n).toFixed(1).padStart(8)} ${(r.Achanged / r.n).toFixed(1).padStart(6)}  ` +
        `${(r.Bcons / r.n).toFixed(1).padStart(6)} ${(r.Brecomp / r.n).toFixed(1).padStart(8)} ${(r.Bchanged / r.n).toFixed(1).padStart(5)}  ` +
        `${(r.closure / r.n).toFixed(1).padStart(7)} ${(r.missed / r.n).toFixed(1).padStart(6)}  ${(r.iters / r.n).toFixed(1).padStart(6)}`
    );
  }
}
