/**
 * S011 — checks: retention from FoldStateDelta, differential equivalence,
 * inverse attack, vocabulary coverage, semantic/fold classification,
 * determinism, branch isolation, cost.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive, foldStateDeltas, type WorldState } from "../../src/derive/world-state";
import type { FoldStepDelta } from "../../src/derive/propagation";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
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
import { performance } from "node:perf_hooks";

export function isEmptyDiff(d: ReturnType<typeof worldDiff>): boolean {
  return (
    d.statusChanges.length === 0 &&
    d.factAdditions.length === 0 &&
    d.factRemovals.length === 0 &&
    d.factOverrides.length === 0 &&
    d.edgeChanges.length === 0 &&
    d.contradictionsIntroduced.length === 0 &&
    d.contradictionsResolved.length === 0 &&
    d.constraintViolationsIntroduced.length === 0 &&
    d.constraintViolationsResolved.length === 0 &&
    d.temporalViolationsIntroduced.length === 0 &&
    d.temporalViolationsResolved.length === 0 &&
    d.reachabilityChanges.length === 0 &&
    d.workStatusChanges.length === 0
  );
}

export function sameWorld(a: WorldState, b: WorldState): boolean {
  return (
    canonicalJson(effectiveSemanticState(a)) === canonicalJson(effectiveSemanticState(b)) &&
    a.stateHash === b.stateHash &&
    isEmptyDiff(worldDiff(a, b))
  );
}

/** S011 retention: keep an intervention iff the fold reported a non-empty delta. */
export function retainByFoldDelta(canon: Canon, H: Intervention[]): { retained: Intervention[]; deltas: FoldStepDelta[] } {
  const deltas = foldStateDeltas(canon, H);
  const retained = H.filter((_, i) => (deltas[i]?.components.length ?? 0) > 0);
  return { retained, deltas };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomHistory(canon: Canon, h: number, seed: number): Intervention[] {
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
    else if (ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), true, "r"));
  }
  return out;
}

/* ---- differential equivalence ---- */
export interface DiffResult {
  canon: string;
  cases: number;
  equivalent: number;
  failures: { name: string; len: number; retained: number }[];
}

export function differential(canon: Canon, canonName: string, histories: [string, Intervention[]][]): DiffResult {
  let eq = 0;
  const failures: DiffResult["failures"] = [];
  for (const [name, H] of histories) {
    const { retained } = retainByFoldDelta(canon, H);
    if (sameWorld(derive(canon, H), derive(canon, retained))) eq++;
    else failures.push({ name, len: H.length, retained: retained.length });
  }
  return { canon: canonName, cases: histories.length, equivalent: eq, failures };
}

/* ---- semantic vs fold vs future-observability classification ---- */
export interface ClassRow {
  kind: string;
  target: string;
  semanticChanged: boolean;
  foldChanged: boolean;
  futureRelevant: boolean;
  category: "A" | "B" | "C" | "D";
}

/**
 * For each step k in H:
 *   semanticChanged = derive(H[0..k]).hash != derive(H[0..k-1]).hash
 *   foldChanged     = foldStateDeltas(H)[k].components.length > 0
 *   futureRelevant  = removing H[k] changes derive(H).hash
 * Category: A=(sem,fold,rel) B=(¬sem,fold,rel) C=(¬sem,fold,¬rel) D=(¬sem,¬fold,¬rel)
 */
export function classify(canon: Canon, H: Intervention[]): ClassRow[] {
  const deltas = foldStateDeltas(canon, H);
  const fullHash = derive(canon, H).stateHash;
  const rows: ClassRow[] = [];
  let prevHash = derive(canon, []).stateHash;
  for (let k = 0; k < H.length; k++) {
    const prefix = H.slice(0, k + 1);
    const curHash = derive(canon, prefix).stateHash;
    const semanticChanged = curHash !== prevHash;
    const foldChanged = (deltas[k]?.components.length ?? 0) > 0;
    const without = [...H.slice(0, k), ...H.slice(k + 1)];
    const futureRelevant = derive(canon, without).stateHash !== fullHash;
    let category: ClassRow["category"] = "D";
    if (semanticChanged && foldChanged && futureRelevant) category = "A";
    else if (!semanticChanged && foldChanged && futureRelevant) category = "B";
    else if (!semanticChanged && foldChanged && !futureRelevant) category = "C";
    else if (!semanticChanged && !foldChanged && !futureRelevant) category = "D";
    rows.push({ kind: H[k]!.kind, target: H[k]!.target, semanticChanged, foldChanged, futureRelevant, category });
    prevHash = curHash;
  }
  return rows;
}

/* ---- inverse attack: empty delta but future-relevant ---- */
export interface InverseHit {
  canon: string;
  history: Intervention[];
  index: number;
  kind: string;
  target: string;
}

export function inverseAttack(canon: Canon, canonName: string, histories: [string, Intervention[]][]): InverseHit[] {
  const hits: InverseHit[] = [];
  for (const [, H] of histories) {
    const deltas = foldStateDeltas(canon, H);
    const fullHash = derive(canon, H).stateHash;
    for (let k = 0; k < H.length; k++) {
      if ((deltas[k]?.components.length ?? 0) === 0) {
        const without = [...H.slice(0, k), ...H.slice(k + 1)];
        if (derive(canon, without).stateHash !== fullHash) {
          hits.push({ canon: canonName, history: H, index: k, kind: H[k]!.kind, target: H[k]!.target });
        }
      }
    }
  }
  return hits;
}

/* ---- vocabulary coverage ---- */
export interface CoverageRow {
  operation: string;
  tested: number;
  changedCount: number;
  emptyCount: number;
  failures: number;
}

export function coverage(canon: Canon, histories: [string, Intervention[]][]): CoverageRow[] {
  const ops = ["setFact", "relocate", "negateEvent", "forceEvent", "retractFact", "severEdge", "addEdge"];
  const acc: Record<string, { tested: number; changed: number; empty: number; failures: number }> = {};
  for (const o of ops) acc[o] = { tested: 0, changed: 0, empty: 0, failures: 0 };
  for (const [, H] of histories) {
    const deltas = foldStateDeltas(canon, H);
    const ok = sameWorld(derive(canon, H), derive(canon, H.filter((_, i) => (deltas[i]?.components.length ?? 0) > 0)));
    for (let i = 0; i < H.length; i++) {
      const k = H[i]!.kind;
      if (acc[k] === undefined) continue;
      acc[k]!.tested++;
      if ((deltas[i]?.components.length ?? 0) > 0) acc[k]!.changed++;
      else acc[k]!.empty++;
      if (!ok) acc[k]!.failures++;
    }
  }
  return ops.map((o) => ({ operation: o, tested: acc[o]!.tested, changedCount: acc[o]!.changed, emptyCount: acc[o]!.empty, failures: acc[o]!.failures }));
}

/* ---- determinism ---- */
export function determinism(canon: Canon, H: Intervention[], trials: number): { stable: boolean; sample: string } {
  const keys = new Set<string>();
  for (let t = 0; t < trials; t++) {
    keys.add(canonicalJson(foldStateDeltas(canon, H)));
  }
  return { stable: keys.size === 1, sample: [...keys][0] ?? "" };
}

/* ---- branch isolation ---- */
export function branchIsolation(canon: Canon, prefix: Intervention[], branches: Intervention[][]): { isolationOk: boolean; legacyMatch: boolean } {
  const baseKey = canonicalJson(foldStateDeltas(canon, prefix));
  let isolationOk = true;
  let legacyMatch = true;
  for (const b of branches) {
    const full = [...prefix, ...b];
    if (canonicalJson(foldStateDeltas(canon, prefix)) !== baseKey) isolationOk = false;
    const { retained } = retainByFoldDelta(canon, full);
    if (!sameWorld(derive(canon, full), derive(canon, retained))) legacyMatch = false;
  }
  return { isolationOk, legacyMatch };
}

/* ---- cost ---- */
export interface CostRow {
  canon: string;
  h: number;
  plainMs: number;
  instrumentedMs: number;
  overhead: number;
}

export function cost(canon: Canon, canonName: string, horizons: number[], seed: number): CostRow[] {
  const out: CostRow[] = [];
  for (const h of horizons) {
    const H = randomHistory(canon, h, seed);
    const t0 = performance.now();
    derive(canon, H);
    const plainMs = performance.now() - t0;
    const t1 = performance.now();
    foldStateDeltas(canon, H);
    const instrumentedMs = performance.now() - t1;
    out.push({ canon: canonName, h, plainMs, instrumentedMs, overhead: plainMs > 0 ? instrumentedMs / plainMs : 0 });
  }
  return out;
}

export { verrinCanon, ordosCanon };
export type { Canon };
