/**
 * S009 — supporting checks: idempotence, sufficiency, determinism, branch
 * isolation, commutation, vocabulary coverage.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
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
import { reduceChain } from "./reduction";
import { isEmptyDiff } from "./counterexamples";

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

const key = (h: Intervention[]): string => canonicalJson(h.map((i) => ({ k: i.kind, t: i.target, p: i.params })));

/* ---- idempotence ---- */
export interface IdempotenceResult {
  canon: string;
  cases: number;
  idempotent: number;
  failures: { name: string; len: number; r1: number; r2: number }[];
}

export function checkIdempotence(canon: Canon, canonName: string, histories: [string, Intervention[]][]): IdempotenceResult {
  let idem = 0;
  const failures: IdempotenceResult["failures"] = [];
  for (const [name, h] of histories) {
    const r1 = reduceChain(canon, h);
    const r2 = reduceChain(canon, r1);
    if (key(r1) === key(r2)) idem++;
    else failures.push({ name, len: h.length, r1: r1.length, r2: r2.length });
  }
  return { canon: canonName, cases: histories.length, idempotent: idem, failures };
}

/* ---- differential sufficiency ---- */
export interface SufficiencyResult {
  canon: string;
  cases: number;
  equivalent: number;
  failures: { name: string; len: number; reduced: number }[];
}

export function checkSufficiency(canon: Canon, canonName: string, histories: [string, Intervention[]][]): SufficiencyResult {
  let eq = 0;
  const failures: SufficiencyResult["failures"] = [];
  for (const [name, h] of histories) {
    const r = reduceChain(canon, h);
    const a = derive(canon, h);
    const b = derive(canon, r);
    const ok =
      canonicalJson(effectiveSemanticState(a)) === canonicalJson(effectiveSemanticState(b)) &&
      a.stateHash === b.stateHash &&
      isEmptyDiff(worldDiff(a, b));
    if (ok) eq++;
    else failures.push({ name, len: h.length, reduced: r.length });
  }
  return { canon: canonName, cases: histories.length, equivalent: eq, failures };
}

/* ---- determinism ---- */
export interface DeterminismResult {
  canon: string;
  trials: number;
  stable: boolean;
  sampleLen: number;
}

export function checkDeterminism(canon: Canon, canonName: string, history: Intervention[], trials: number): DeterminismResult {
  const keys = new Set<string>();
  const hashes = new Set<string>();
  for (let t = 0; t < trials; t++) {
    const r = reduceChain(canon, history);
    keys.add(key(r));
    hashes.add(derive(canon, r).stateHash);
  }
  return { canon: canonName, trials, stable: keys.size === 1 && hashes.size === 1, sampleLen: reduceChain(canon, history).length };
}

/* ---- branch isolation ---- */
export interface BranchResult {
  canon: string;
  branches: number;
  isolationOk: boolean;
  legacyMatch: boolean;
}

export function checkBranchIsolation(canon: Canon, canonName: string, prefix: Intervention[], branches: Intervention[][]): BranchResult {
  const reducedPrefix = reduceChain(canon, prefix);
  let isolationOk = true;
  let legacyMatch = true;
  for (const b of branches) {
    const reducedBranch = reduceChain(canon, [...prefix, ...b]);
    // Reducing the branch must not have mutated the shared prefix reduction.
    if (key(reduceChain(canon, prefix)) !== key(reducedPrefix)) isolationOk = false;
    const legacy = derive(canon, [...prefix, ...b]).stateHash;
    if (derive(canon, reducedBranch).stateHash !== legacy) legacyMatch = false;
  }
  return { canon: canonName, branches: branches.length, isolationOk, legacyMatch };
}

/* ---- commutation ---- */
export interface CommuteResult {
  canon: string;
  pair: string;
  sameState: boolean;
  sameReduced: boolean;
}

export function checkCommutation(canon: Canon, canonName: string, pairs: [string, Intervention, Intervention][]): CommuteResult[] {
  return pairs.map(([label, a, b]) => {
    const ab = derive(canon, [a, b]);
    const ba = derive(canon, [b, a]);
    return {
      canon: canonName,
      pair: label,
      sameState: ab.stateHash === ba.stateHash,
      sameReduced: key(reduceChain(canon, [a, b])) === key(reduceChain(canon, [b, a])),
    };
  });
}

/* ---- vocabulary coverage ---- */
export interface CoverageRow {
  operation: string;
  rule: string;
  tested: number;
  counterexamples: number;
}

export function coverage(canon: Canon, histories: [string, Intervention[]][]): CoverageRow[] {
  const counts: Record<string, { tested: number; cex: number }> = {
    setFact: { tested: 0, cex: 0 },
    relocate: { tested: 0, cex: 0 },
    negateEvent: { tested: 0, cex: 0 },
    forceEvent: { tested: 0, cex: 0 },
    retractFact: { tested: 0, cex: 0 },
    severEdge: { tested: 0, cex: 0 },
    addEdge: { tested: 0, cex: 0 },
  };
  for (const [, h] of histories) {
    const kinds = new Set(h.map((i) => i.kind));
    const r = reduceChain(canon, h);
    const a = derive(canon, h);
    const b = derive(canon, r);
    const bad =
      canonicalJson(effectiveSemanticState(a)) !== canonicalJson(effectiveSemanticState(b)) ||
      a.stateHash !== b.stateHash ||
      !isEmptyDiff(worldDiff(a, b));
    for (const k of kinds) {
      if (counts[k] !== undefined) {
        counts[k]!.tested++;
        if (bad) counts[k]!.cex++;
      }
    }
  }
  const ruleOf: Record<string, string> = {
    setFact: "R1/R2",
    relocate: "R1/R2",
    negateEvent: "R3",
    forceEvent: "R4",
    retractFact: "R5",
    severEdge: "R6",
    addEdge: "R6",
  };
  return Object.entries(counts).map(([operation, c]) => ({
    operation,
    rule: ruleOf[operation] ?? "?",
    tested: c.tested,
    counterexamples: c.cex,
  }));
}
