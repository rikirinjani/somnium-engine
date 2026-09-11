/**
 * S010 — checks: differential equivalence, multi-fact stress, vocabulary
 * coverage, determinism, branch isolation, scaling.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive, type WorldState } from "../../src/derive/world-state";
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
import {
  retainFromAccumulators,
  retainByStateChange,
  retainByStateChangeDetailed,
  sameWorld,
} from "./retain";
import { overlapCanon, F1, F2 } from "./synthetic";

export type MechanismName = "M-B" | "M-H";

function retain(canon: Canon, H: Intervention[], m: MechanismName): Intervention[] {
  return m === "M-B" ? retainFromAccumulators(canon, H) : retainByStateChange(canon, H);
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
export interface DiffRow {
  mechanism: MechanismName;
  canon: string;
  cases: number;
  equivalent: number;
  failures: { name: string; len: number; retained: number }[];
}

export function differential(canon: Canon, canonName: string, histories: [string, Intervention[]][]): DiffRow[] {
  return (["M-B", "M-H"] as MechanismName[]).map((m) => {
    let eq = 0;
    const failures: DiffRow["failures"] = [];
    for (const [name, H] of histories) {
      const R = retain(canon, H, m);
      const a = derive(canon, H);
      const b = derive(canon, R);
      if (sameWorld(a, b).equal) eq++;
      else failures.push({ name, len: H.length, retained: R.length });
    }
    return { mechanism: m, canon: canonName, cases: histories.length, equivalent: eq, failures };
  });
}

/* ---- multi-fact / identity stress ---- */
export interface StressCase {
  name: string;
  canon: string;
  history: Intervention[];
}

export function multiFactStress(): StressCase[] {
  const out: StressCase[] = [];
  const mk = (name: string, history: Intervention[]): StressCase => ({ name, canon: "overlap", history });

  out.push(mk("write-retract-write (NCR-006)", [setFact("char/x", "at", "W1", "s"), retractFact(F2, "s"), setFact("char/x", "at", "W2", "s")]));
  out.push(mk("write-retract(other)-write", [setFact("char/x", "at", "W1", "s"), retractFact(F1, "s"), setFact("char/x", "at", "W2", "s")]));
  out.push(mk("write-write-retract", [setFact("char/x", "at", "W1", "s"), setFact("char/x", "at", "W2", "s"), retractFact(F2, "s")]));
  out.push(mk("write-retract-retract-write", [setFact("char/x", "at", "W1", "s"), retractFact(F2, "s"), retractFact(F1, "s"), setFact("char/x", "at", "W2", "s")]));
  out.push(mk("retract-write-retract-write", [retractFact(F2, "s"), setFact("char/x", "at", "W1", "s"), retractFact(F2, "s"), setFact("char/x", "at", "W2", "s")]));
  out.push(mk("repeated-writes-identity-reuse", [setFact("char/x", "at", "A", "s"), setFact("char/x", "at", "B", "s"), setFact("char/x", "at", "C", "s")]));
  out.push(mk("write-retract-write-retract", [setFact("char/x", "at", "W1", "s"), retractFact(F2, "s"), setFact("char/x", "at", "W2", "s"), retractFact(F1, "s")]));
  out.push(mk("negate-ev/b then write-retract-write", [negateEvent("ev/b", "s"), setFact("char/x", "at", "W1", "s"), retractFact(F2, "s"), setFact("char/x", "at", "W2", "s")]));
  out.push(mk("both-retracts-then-write", [retractFact(F1, "s"), retractFact(F2, "s"), setFact("char/x", "at", "W", "s")]));
  out.push(mk("write-then-both-retract", [setFact("char/x", "at", "W", "s"), retractFact(F1, "s"), retractFact(F2, "s")]));
  return out;
}

export function runStress(cases: StressCase[]): DiffRow[] {
  const canon = overlapCanon();
  const histories: [string, Intervention[]][] = cases.map((c) => [c.name, c.history]);
  return differential(canon, "overlap-synthetic", histories);
}

/* ---- vocabulary coverage ---- */
export interface CoverageRow {
  operation: string;
  tested: number;
  mBFailures: number;
  mHFailures: number;
}

export function coverage(canon: Canon, histories: [string, Intervention[]][]): CoverageRow[] {
  const ops = ["setFact", "relocate", "negateEvent", "forceEvent", "retractFact", "severEdge", "addEdge"];
  const counts: Record<string, { tested: number; mb: number; mh: number }> = {};
  for (const o of ops) counts[o] = { tested: 0, mb: 0, mh: 0 };
  for (const [, H] of histories) {
    const kinds = new Set(H.map((i) => i.kind));
    const a = derive(canon, H);
    const bad = (m: MechanismName): boolean => !sameWorld(a, derive(canon, retain(canon, H, m))).equal;
    const mbBad = bad("M-B");
    const mhBad = bad("M-H");
    for (const k of kinds) {
      if (counts[k] !== undefined) {
        counts[k]!.tested++;
        if (mbBad) counts[k]!.mb++;
        if (mhBad) counts[k]!.mh++;
      }
    }
  }
  return ops.map((o) => ({ operation: o, tested: counts[o]!.tested, mBFailures: counts[o]!.mb, mHFailures: counts[o]!.mh }));
}

/* ---- determinism ---- */
export interface DetResult {
  canon: string;
  mechanism: MechanismName;
  trials: number;
  stable: boolean;
}

export function determinism(canon: Canon, canonName: string, H: Intervention[], trials: number): DetResult[] {
  return (["M-B", "M-H"] as MechanismName[]).map((m) => {
    const keys = new Set<string>();
    for (let t = 0; t < trials; t++) {
      const R = retain(canon, H, m);
      keys.add(JSON.stringify(R.map((i) => [i.kind, i.target, i.params])));
    }
    return { canon: canonName, mechanism: m, trials, stable: keys.size === 1 };
  });
}

/* ---- branch isolation ---- */
export interface BranchResult {
  canon: string;
  mechanism: MechanismName;
  branches: number;
  isolationOk: boolean;
  legacyMatch: boolean;
}

export function branchIsolation(canon: Canon, canonName: string, prefix: Intervention[], branches: Intervention[][]): BranchResult[] {
  const baseR = retain(canon, prefix, "M-H");
  const baseKey = JSON.stringify(baseR);
  return (["M-B", "M-H"] as MechanismName[]).map((m) => {
    let isolationOk = true;
    let legacyMatch = true;
    for (const b of branches) {
      const full = [...prefix, ...b];
      const R = retain(canon, full, m);
      if (m === "M-H" && JSON.stringify(retain(canon, prefix, m)) !== baseKey) isolationOk = false;
      if (!sameWorld(derive(canon, full), derive(canon, R)).equal) legacyMatch = false;
    }
    return { canon: canonName, mechanism: m, branches: branches.length, isolationOk, legacyMatch };
  });
}

/* ---- scaling ---- */
export interface ScaleRow {
  canon: string;
  h: number;
  mechanism: MechanismName;
  retained: number;
  fraction: number;
  oracleCalls: number;
}

export function scaling(canon: Canon, canonName: string, horizons: number[], seed: number): ScaleRow[] {
  const out: ScaleRow[] = [];
  for (const h of horizons) {
    const H = randomHistory(canon, h, seed);
    for (const m of ["M-B", "M-H"] as MechanismName[]) {
      const trace = m === "M-H" ? retainByStateChangeDetailed(canon, H) : { retained: retainFromAccumulators(canon, H), oracleCalls: 0 };
      out.push({
        canon: canonName,
        h,
        mechanism: m,
        retained: trace.retained.length,
        fraction: h > 0 ? trace.retained.length / h : 0,
        oracleCalls: trace.oracleCalls,
      });
    }
  }
  return out;
}

export { verrinCanon, ordosCanon, overlapCanon };
export type { Canon, WorldState };
