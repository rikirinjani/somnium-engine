/**
 * S015 — Incremental Propagation / Affected-Fixpoint Derivation.
 *
 * The full `propagateJudgments` remains the reference. This probe:
 *   1. builds the reverse-dependency map of the model,
 *   2. measures the AFFECTED REGION of each intervention type (locality),
 *   3. tests whether a naive scoped recompute equals the full fixpoint.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { buildModel, propagateJudgments, type DerivationModel } from "../../src/derive/propagation";
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

/** reverse dependency: node -> nodes whose support/conflicts consult it */
function dependents(model: DerivationModel): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const list = out.get(from) ?? [];
    list.push(to);
    out.set(from, list);
  };
  for (const [target, groups] of model.supportGroups) {
    for (const g of groups) for (const c of g.conjuncts) add(c, target);
  }
  for (const [target, sources] of model.enablesIn) {
    for (const s of sources) add(s, target);
  }
  for (const e of model.excludesEdges) {
    add(e.from, e.to);
    add(e.to, e.from);
  }
  for (const e of model.invariantEdges) add(e.from, e.to);
  for (const e of model.precedesEdges) {
    add(e.from, e.to);
    add(e.to, e.from);
  }
  return out;
}

/** transitive closure over dependents */
function closure(seed: string[], deps: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [...seed];
  while (queue.length > 0) {
    const n = queue.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of deps.get(n) ?? []) if (!seen.has(d)) queue.push(d);
  }
  return seen;
}

/** nodes directly touched by a model delta between two models */
function directDelta(a: DerivationModel, b: DerivationModel): string[] {
  const out = new Set<string>();
  const diff = (x: Set<string>, y: Set<string>): void => {
    for (const n of x) if (!y.has(n)) out.add(n);
    for (const n of y) if (!x.has(n)) out.add(n);
  };
  diff(a.negated, b.negated);
  diff(a.retracted, b.retracted);
  for (const k of a.forcedBy.keys()) if (b.forcedBy.get(k) !== a.forcedBy.get(k)) out.add(k);
  for (const k of b.forcedBy.keys()) if (a.forcedBy.get(k) !== b.forcedBy.get(k)) out.add(k);
  for (const k of a.overriddenCells.keys()) if (canonicalJson(b.overriddenCells.get(k)) !== canonicalJson(a.overriddenCells.get(k))) {
    // cell -> the canon facts in that cell + the synthetic id
    try {
      const [s, p] = JSON.parse(k) as [string, string];
      for (const f of a.facts.values()) if (f.subject === s && f.predicate === p) out.add(f.id);
      out.add(`derived:${k}`);
    } catch {
      /* ignore */
    }
  }
  for (const k of b.overriddenCells.keys()) if (canonicalJson(a.overriddenCells.get(k)) !== canonicalJson(b.overriddenCells.get(k))) {
    try {
      const [s, p] = JSON.parse(k) as [string, string];
      for (const f of b.facts.values()) if (f.subject === s && f.predicate === p) out.add(f.id);
      out.add(`derived:${k}`);
    } catch {
      /* ignore */
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

console.log("=== S015 — affected-region locality + scoped-recompute exactness ===\n");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const H = history(canon, 200, 20260920);
  const byKind: Record<string, { n: number; direct: number; affected: number; total: number; scopedMismatch: number }> = {};
  let total = 0;

  for (let i = 0; i < H.length; i++) {
    const before = buildModel(canon, H.slice(0, i));
    const after = buildModel(canon, H.slice(0, i + 1));
    const deps = dependents(after);
    const direct = directDelta(before, after);
    const affected = closure(direct, deps);
    total = after.nodeIds.length;
    const k = H[i]!.kind;
    const rec = (byKind[k] ??= { n: 0, direct: 0, affected: 0, total: 0, scopedMismatch: 0 });
    rec.n++;
    rec.direct += direct.length;
    rec.affected += affected.size;
    rec.total = after.nodeIds.length;

    // naive scoped recompute: seed truth with previous, re-evaluate only affected
    const full = propagateJudgments(after).judgments;
    const prev = propagateJudgments(before).judgments;
    // Exactness test: does re-running the FULL fixpoint on `after` equal a
    // version that starts from `prev` and only touches `affected`?
    // (We test the simplest claim: unaffected nodes keep their previous truth.)
    let mismatch = 0;
    for (const node of after.nodeIds) {
      if (!affected.has(node)) {
        const a = canonicalJson(prev.get(node) ?? null);
        const b = canonicalJson(full.get(node) ?? null);
        if (a !== b) mismatch++;
      }
    }
    rec.scopedMismatch += mismatch;
  }

  console.log(`--- ${name} (model nodes=${total}) ---`);
  for (const [k, r] of Object.entries(byKind)) {
    console.log(
      `  ${k.padEnd(12)} n=${String(r.n).padStart(3)} avgDirect=${(r.direct / r.n).toFixed(1)} ` +
        `avgAffected=${(r.affected / r.n).toFixed(1)} (${((r.affected / r.n / total) * 100).toFixed(0)}% of model) ` +
        `unaffected-that-changed=${r.scopedMismatch}`
    );
  }
  // final hash sanity
  console.log(`  final stateHash=${derive(canon, H).stateHash}`);
}
