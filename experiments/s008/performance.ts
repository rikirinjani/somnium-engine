/**
 * S008 — performance comparison (Phases 9 & 10).
 *
 * Legacy:      derive(canon, history[0..k]) for each k        (reference)
 * Incremental: step(step(...))                                (candidate)
 *
 * The hypothesis is legacy walk ≈ O(H^2) vs incremental walk ≈ O(H). It is
 * MEASURED, not asserted. The legacy walk is capped (`walkLimit`) because it is
 * genuinely quadratic; the single final derive is measured at every horizon,
 * including H=100,000.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive, type WorldState } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { hashState } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";
import { incrementalDeriveWithChain, initialState, step } from "./incremental";
import { performance } from "node:perf_hooks";

/* ------------------------------------------------------------------ */
/* Deterministic workload                                              */
/* ------------------------------------------------------------------ */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function linearHistory(canon: Canon, h: number, seed: number): Intervention[] {
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
    if (roll < 0.4 && ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), objs.length > 0 ? pick(objs) : true, "p"));
    else if (roll < 0.55 && evs.length > 0) out.push(negateEvent(pick(evs), "p"));
    else if (roll < 0.7 && evs.length > 0) out.push(forceEvent(pick(evs), "p"));
    else if (roll < 0.82 && factIds.length > 0) out.push(retractFact(pick(factIds), "p"));
    else if (roll < 0.92 && edges.length > 0) out.push(severEdge(pick(edges).id, "p"));
    else if (edges.length > 0) out.push(addEdge({ ...pick(edges) }, "p"));
    else if (ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), true, "p"));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

export interface PerfRow {
  canon: string;
  h: number;
  legacyFinalMs: number;
  incrementalFinalMs: number;
  legacyWalkMs: number;
  incrementalWalkMs: number;
  legacyWalkIps: number;
  incrementalWalkIps: number;
  reducedChainLen: number;
  reprBytes: number;
  stateHashMs: number;
  diffEqualStatesMs: number;
  hashesMatch: boolean;
  peakRssBytes: number;
  status: "ok" | "aborted";
  note?: string;
}

function memRss(): number {
  return process.memoryUsage().rss;
}

function measure(canon: Canon, canonName: string, h: number, seed: number, walkLimit: number, maxMs: number): PerfRow {
  const history = linearHistory(canon, h, seed);
  const t0 = performance.now();
  const peak = { v: memRss() };

  try {
    // --- single final derive: legacy ---
    const legacyStart = performance.now();
    const legacy = derive(canon, history);
    const legacyFinalMs = performance.now() - legacyStart;
    peak.v = Math.max(peak.v, memRss());

    // --- single final derive: incremental ---
    const incStart = performance.now();
    const inc = incrementalDeriveWithChain(canon, history);
    const incrementalFinalMs = performance.now() - incStart;
    peak.v = Math.max(peak.v, memRss());

    const hashesMatch = legacy.stateHash === inc.world.stateHash;

    // --- representation + hash + equal-state diff on the final world ---
    const repr = effectiveSemanticState(legacy);
    const reprBytes = Buffer.byteLength(JSON.stringify(repr), "utf8");
    const hsStart = performance.now();
    hashState(repr);
    const stateHashMs = performance.now() - hsStart;
    const dStart = performance.now();
    worldDiff(legacy, legacy);
    const diffEqualStatesMs = performance.now() - dStart;

    // --- prefix walks (capped: the legacy walk is genuinely quadratic) ---
    let legacyWalkMs = -1;
    let incrementalWalkMs = -1;
    let legacyWalkIps = -1;
    let incrementalWalkIps = -1;
    if (h <= walkLimit) {
      const lwStart = performance.now();
      const prefix: Intervention[] = [];
      for (let k = 0; k <= h; k++) {
        derive(canon, prefix);
        if (k < h) prefix.push(history[k]!);
      }
      legacyWalkMs = performance.now() - lwStart;
      peak.v = Math.max(peak.v, memRss());

      const iwStart = performance.now();
      let st = initialState(canon);
      for (const iv of history) st = step(canon, st, iv);
      incrementalWalkMs = performance.now() - iwStart;
      peak.v = Math.max(peak.v, memRss());

      legacyWalkIps = legacyWalkMs > 0 ? h / (legacyWalkMs / 1000) : Infinity;
      incrementalWalkIps = incrementalWalkMs > 0 ? h / (incrementalWalkMs / 1000) : Infinity;
    } else {
      // Above the legacy cap the incremental walk is the SAME fold as the
      // incremental final derive (both step through the whole history), so reuse
      // that measurement instead of paying for it twice. The legacy walk is
      // genuinely infeasible here, which is itself the result.
      incrementalWalkMs = incrementalFinalMs;
      incrementalWalkIps = incrementalFinalMs > 0 ? h / (incrementalFinalMs / 1000) : Infinity;
    }

    return {
      canon: canonName,
      h,
      legacyFinalMs,
      incrementalFinalMs,
      legacyWalkMs,
      incrementalWalkMs,
      legacyWalkIps,
      incrementalWalkIps,
      reducedChainLen: inc.chain.length,
      reprBytes,
      stateHashMs,
      diffEqualStatesMs,
      hashesMatch,
      peakRssBytes: peak.v,
      status: "ok",
    };
  } catch (err) {
    return {
      canon: canonName,
      h,
      legacyFinalMs: -1,
      incrementalFinalMs: -1,
      legacyWalkMs: -1,
      incrementalWalkMs: -1,
      legacyWalkIps: -1,
      incrementalWalkIps: -1,
      reducedChainLen: -1,
      reprBytes: -1,
      stateHashMs: -1,
      diffEqualStatesMs: -1,
      hashesMatch: false,
      peakRssBytes: memRss(),
      status: "aborted",
      note: `${err instanceof Error ? err.message : String(err)} (after ${((performance.now() - t0) / 1000).toFixed(1)}s)`,
    };
  }
}

export function runPerformance(
  opts: {
    canons?: ("verrin" | "ordos")[];
    horizons?: number[];
    seed?: number;
    walkLimit?: number;
    maxMs?: number;
  } = {}
): PerfRow[] {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const horizons = opts.horizons ?? [10, 100, 1000, 10000, 100000];
  const seed = opts.seed ?? 20260911;
  const walkLimit = opts.walkLimit ?? 3000;
  const maxMs = opts.maxMs ?? 900_000;
  const rows: PerfRow[] = [];
  for (const name of canons) {
    const canon = name === "verrin" ? verrinCanon() : ordosCanon();
    for (const h of horizons) {
      const started = performance.now();
      const row = measure(canon, name, h, seed, walkLimit, maxMs);
      rows.push(row);
      console.log(
        `[PERF] ${name} H=${h} legacyFinal=${row.legacyFinalMs.toFixed(1)}ms incFinal=${row.incrementalFinalMs.toFixed(1)}ms ` +
          `legacyWalk=${row.legacyWalkMs < 0 ? "skip" : row.legacyWalkMs.toFixed(0) + "ms"} ` +
          `incWalk=${row.incrementalWalkMs < 0 ? "skip" : row.incrementalWalkMs.toFixed(0) + "ms"} ` +
          `reduced=${row.reducedChainLen} match=${row.hashesMatch} peak=${(row.peakRssBytes / 1e6).toFixed(0)}MB ${row.status}`
      );
      if (row.status === "aborted") break;
      if (performance.now() - started > maxMs) {
        console.log(`  (per-horizon budget exceeded; stopping)`);
        break;
      }
    }
  }
  return rows;
}
