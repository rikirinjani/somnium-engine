/**
 * S017 — Propagation Delta Observability / Predictive Invalidation Frontier.
 *
 * For each prefix: capture the judgment map, compute the CROSS-PREFIX delta
 * (Jh vs Jh-1), compare it against the S015 dependency closure, classify each
 * changed node, and test whether a dependency+cycle frontier is a SOUND
 * over-approximation of the delta.
 *
 * Observation only: `derive` / `propagateJudgments` semantics untouched.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, type DerivationModel } from "../../src/derive/propagation";
import { derive } from "../../src/derive/world-state";
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

function closure(seed: string[], deps: Map<string, string[]>): Set<string> {
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

/** cycle membership: nodes on a REQUIRES cycle (strongly-connected set) */
function cycleMembers(model: DerivationModel): Set<string> {
  const out = new Set<string>();
  for (const [target, groups] of model.supportGroups) {
    for (const g of groups) {
      for (const c of g.conjuncts) {
        // c -> target; is target -> ... -> c reachable? then cycle
        const seen = new Set<string>();
        const q = [target];
        let cyc = false;
        while (q.length) {
          const n = q.pop()!;
          if (n === c) { cyc = true; break; }
          if (seen.has(n)) continue;
          seen.add(n);
          for (const g2 of model.supportGroups.get(n) ?? []) for (const c2 of g2.conjuncts) q.push(c2);
        }
        if (cyc) { out.add(c); out.add(target); }
      }
    }
  }
  return out;
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

console.log("=== S017 — cross-prefix judgment delta vs dependency closure ===\n");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260922);
  const byKind: Record<string, { n: number; delta: number; closure: number; fn: number; fp: number; unexplained: number; cycle: number; direct: number }> = {};
  let total = 0;

  let prevJ = derive(canon, []).judgments as Record<string, unknown>;
  for (let i = 0; i < H.length; i++) {
    const before = buildModel(canon, H.slice(0, i));
    const after = buildModel(canon, H.slice(0, i + 1));
    total = after.nodeIds.length;
    const curJ = derive(canon, H.slice(0, i + 1)).judgments as Record<string, unknown>;

    // cross-prefix delta: nodes whose judgment differs from the previous prefix
    const delta = new Set<string>();
    for (const n of new Set([...Object.keys(prevJ), ...Object.keys(curJ)])) {
      if (canonicalJson(prevJ[n]) !== canonicalJson(curJ[n])) delta.add(n);
    }

    const pred = closure(directDelta(before, after), dependents(after));
    const cyc = cycleMembers(after);
    const direct = new Set(directDelta(before, after));

    let fn = 0; // false negatives: delta nodes outside the predicted frontier
    let unexplained = 0;
    let cycleHits = 0;
    let directHits = 0;
    for (const n of delta) {
      if (!pred.has(n)) fn++;
      if (direct.has(n)) directHits++;
      else if (cyc.has(n)) cycleHits++;
      else if (!pred.has(n)) unexplained++;
    }
    // false positives: predicted but not changed
    let fp = 0;
    for (const n of pred) if (!delta.has(n)) fp++;

    const k = H[i]!.kind;
    const r = (byKind[k] ??= { n: 0, delta: 0, closure: 0, fn: 0, fp: 0, unexplained: 0, cycle: 0, direct: 0 });
    r.n++;
    r.delta += delta.size;
    r.closure += pred.size;
    r.fn += fn;
    r.fp += fp;
    r.unexplained += unexplained;
    r.cycle += cycleHits;
    r.direct += directHits;
    prevJ = curJ;
  }
  console.log(`--- ${name} (model nodes=${total}) ---`);
  console.log("  kind          n   delta  closure  FN   FP   direct  cycle  unexplained");
  for (const [k, r] of Object.entries(byKind)) {
    console.log(
      `  ${k.padEnd(12)}${String(r.n).padStart(3)}  ${(r.delta / r.n).toFixed(2).padStart(6)}  ${(r.closure / r.n).toFixed(2).padStart(6)}  ` +
        `${(r.fn / r.n).toFixed(2).padStart(4)} ${(r.fp / r.n).toFixed(2).padStart(4)}  ${(r.direct / r.n).toFixed(2).padStart(6)}  ` +
        `${(r.cycle / r.n).toFixed(2).padStart(5)}  ${(r.unexplained / r.n).toFixed(2).padStart(11)}`
    );
  }
}
