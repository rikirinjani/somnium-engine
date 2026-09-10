/**
 * S007 — Experiment C: Convergence / Collision
 *
 *   different history -> same effective semantic representation
 *                     -> same stateHash
 *                     -> empty semantic WorldDiff
 *
 * Two parts:
 *   1. Constructed groups: histories that PROVABLY converge (P-007 semantics).
 *   2. Random histories at scale: N chains of length H over a bounded cell
 *      space; count how many distinct semantic states actually arise, and the
 *      distribution of histories per state.
 *
 * Crucially, `stateHash` excludes `interventions` (lineage) by construction, so
 * convergence here is real semantic convergence, not provenance equality.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { worldDiff } from "../../src/diff/diff";
import {
  type EnvInfo,
  MemorySampler,
  ResourceGuard,
  ResourceAbort,
  fmtBytes,
  fmtMs,
  time,
  seededRng,
} from "./harness";
import { convergentGroups, buildTargetPool, makeIntervention } from "./workloads";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ConvergentGroupResult {
  canon: string;
  label: string;
  histories: number;
  distinctHashes: number;
  converged: boolean;
  pairwiseDiffEmpty: boolean;
  note?: string;
}

export interface ConvergenceAtScaleRow {
  canon: string;
  histories: number;
  horizon: number;
  distinctStates: number;
  convergenceRatio: number; // distinctStates / histories
  maxHistoriesPerState: number;
  medianHistoriesPerState: number;
  peakRssBytes: number;
  totalMs: number;
  status: "ok" | "aborted";
  note?: string;
}

export interface ConvergenceResult {
  env: EnvInfo;
  groups: ConvergentGroupResult[];
  atScale: ConvergenceAtScaleRow[];
}

function isEmptyDiff(d: ReturnType<typeof worldDiff>): boolean {
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

/** Part 1 — the constructed convergent groups. */
function runGroups(canon: Canon, canonName: string, seed: number): ConvergentGroupResult[] {
  const groups = convergentGroups(canon, seed);
  const out: ConvergentGroupResult[] = [];
  for (const g of groups) {
    const worlds = g.histories.map((h) => derive(canon, h));
    const hashes = new Set(worlds.map((w) => w.stateHash));
    // pairwise empty-diff check on the first vs each other
    let pairwiseEmpty = true;
    for (let i = 1; i < worlds.length; i++) {
      if (!isEmptyDiff(worldDiff(worlds[0]!, worlds[i]!))) pairwiseEmpty = false;
    }
    const converged = hashes.size === 1;
    out.push({
      canon: canonName,
      label: g.label,
      histories: g.histories.length,
      distinctHashes: hashes.size,
      converged,
      pairwiseDiffEmpty: pairwiseEmpty,
    });
    console.log(
      `[C] ${canonName} ${g.label} histories=${g.histories.length} distinct=${hashes.size} ` +
        `converged=${converged} diffEmpty=${pairwiseEmpty}`
    );
  }
  return out;
}

/** Part 2 — random histories at scale over a bounded cell space. */
function runAtScale(
  canon: Canon,
  canonName: string,
  historyCount: number,
  horizon: number,
  seed: number,
  guard: ResourceGuard
): ConvergenceAtScaleRow {
  const sampler = new MemorySampler(20);
  const pool = buildTargetPool(canon);
  try {
    const counts = new Map<string, number>();
    const t = time(() => {
      for (let i = 0; i < historyCount; i++) {
        guard.check(`converge ${canonName} history=${i}`);
        const rng = seededRng(seed + i * 7919);
        const chain = [];
        for (let k = 0; k < horizon; k++) chain.push(makeIntervention(rng, pool, { setFact: 5, negateEvent: 2, forceEvent: 2, retractFact: 1, severEdge: 1, addEdge: 1 }));
        const ws = derive(canon, chain);
        counts.set(ws.stateHash, (counts.get(ws.stateHash) ?? 0) + 1);
      }
    });
    const sample = sampler.stop();
    const distinct = counts.size;
    const perState = [...counts.values()].sort((a, b) => a - b);
    const median = perState.length > 0 ? perState[Math.floor(perState.length / 2)]! : 0;
    const max = perState.length > 0 ? perState[perState.length - 1]! : 0;
    const row: ConvergenceAtScaleRow = {
      canon: canonName,
      histories: historyCount,
      horizon,
      distinctStates: distinct,
      convergenceRatio: historyCount > 0 ? distinct / historyCount : 0,
      maxHistoriesPerState: max,
      medianHistoriesPerState: median,
      peakRssBytes: sample.peakRssBytes,
      totalMs: t.ms,
      status: "ok",
    };
    console.log(
      `[C] ${canonName} histories=${historyCount} H=${horizon} distinct=${distinct} ` +
        `ratio=${row.convergenceRatio.toFixed(3)} max/state=${max} peak=${fmtBytes(sample.peakRssBytes)}`
    );
    return row;
  } catch (err) {
    sampler.stop();
    if (err instanceof ResourceAbort) {
      return {
        canon: canonName,
        histories: historyCount,
        horizon,
        distinctStates: -1,
        convergenceRatio: -1,
        maxHistoriesPerState: -1,
        medianHistoriesPerState: -1,
        peakRssBytes: process.memoryUsage().rss,
        totalMs: -1,
        status: "aborted",
        note: err.message,
      };
    }
    throw err;
  }
}

export function runConvergence(
  env: EnvInfo,
  opts: {
    canons?: ("verrin" | "ordos")[];
    historyCounts?: number[];
    horizon?: number;
    seed?: number;
    maxRssBytes?: number;
    maxMs?: number;
  } = {}
): ConvergenceResult {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const historyCounts = opts.historyCounts ?? [10, 100, 1000, 5000];
  const horizon = opts.horizon ?? 10;
  const seed = opts.seed ?? 20260910;
  const guard = new ResourceGuard({ maxRssBytes: opts.maxRssBytes, maxMs: opts.maxMs });
  const groups: ConvergentGroupResult[] = [];
  const atScale: ConvergenceAtScaleRow[] = [];

  for (const name of canons) {
    const canon = name === "verrin" ? verrinCanon() : ordosCanon();
    groups.push(...runGroups(canon, name, seed));
    for (const n of historyCounts) {
      const row = runAtScale(canon, name, n, horizon, seed, guard);
      atScale.push(row);
      if (row.status === "aborted") break;
    }
  }
  return { env, groups, atScale };
}

export function writeConvergence(result: ConvergenceResult, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "exp-c-convergence.json");
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}
