/**
 * S007 — Experiment D: WorldDiff Cost
 *
 * Measures `worldDiff(A, B)` against representation size and delta size.
 * Three regimes, measured separately:
 *   - equal-state   (A === B semantically)  -> the cheapest possible path
 *   - small-delta   (adjacent chain steps)  -> the common production case
 *   - large-delta   (baseline vs distant)   -> the expensive case
 *
 * Delta size is measured in changed entries (all WorldDiff dimensions summed),
 * so we can see whether runtime is dominated by representation size or by the
 * number of actual differences.
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
  bytesOf,
  fmtBytes,
  fmtMs,
  median,
  time,
} from "./harness";
import { linearWorkload } from "./workloads";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface DiffCostRow {
  canon: string;
  regime: "equal" | "small" | "large";
  reprBytesA: number;
  reprBytesB: number;
  deltaSize: number;
  diffMs: number;
  reps: number;
  note?: string;
}

export interface DiffCostResult {
  env: EnvInfo;
  rows: DiffCostRow[];
  status: "ok" | "aborted";
  abortNote?: string;
}

export function deltaSize(d: ReturnType<typeof worldDiff>): number {
  return (
    d.statusChanges.length +
    d.factAdditions.length +
    d.factRemovals.length +
    d.factOverrides.length +
    d.edgeChanges.length +
    d.contradictionsIntroduced.length +
    d.contradictionsResolved.length +
    d.constraintViolationsIntroduced.length +
    d.constraintViolationsResolved.length +
    d.temporalViolationsIntroduced.length +
    d.temporalViolationsResolved.length +
    d.reachabilityChanges.length +
    d.workStatusChanges.length
  );
}

export function runDiffCost(
  env: EnvInfo,
  opts: {
    canons?: ("verrin" | "ordos")[];
    horizon?: number;
    equalReps?: number;
    maxRssBytes?: number;
    maxMs?: number;
  } = {}
): DiffCostResult {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const horizon = opts.horizon ?? 500;
  const equalReps = opts.equalReps ?? 50;
  const guard = new ResourceGuard({ maxRssBytes: opts.maxRssBytes, maxMs: opts.maxMs });
  const rows: DiffCostRow[] = [];
  const sampler = new MemorySampler(20);

  try {
    for (const name of canons) {
      const canon = name === "verrin" ? verrinCanon() : ordosCanon();
      const { interventions } = linearWorkload(canon, horizon, 20260910);

      // Derive a spread of worlds along the chain.
      const checkpoints = [0, 1, 2, 5, 10, 25, 50, 100, 250, 500].filter((k) => k <= horizon);
      const worlds = checkpoints.map((k) => ({ k, ws: derive(canon, interventions.slice(0, k)), repr: null as ReturnType<typeof effectiveSemanticState> | null }));
      for (const w of worlds) w.repr = effectiveSemanticState(w.ws);

      // --- equal-state: A vs A, repeated ---
      {
        const w = worlds[worlds.length - 1]!;
        const samples: number[] = [];
        let lastDelta = 0;
        for (let i = 0; i < equalReps; i++) {
          guard.check(`diff equal ${name}`);
          const t = time(() => worldDiff(w.ws, w.ws));
          samples.push(t.ms);
          lastDelta = deltaSize(t.value);
        }
        rows.push({
          canon: name,
          regime: "equal",
          reprBytesA: bytesOf(w.repr),
          reprBytesB: bytesOf(w.repr),
          deltaSize: lastDelta,
          diffMs: median(samples),
          reps: equalReps,
        });
        console.log(`[D] ${name} equal repr=${fmtBytes(bytesOf(w.repr))} diff=${fmtMs(median(samples))} delta=${lastDelta}`);
      }

      // --- small-delta: adjacent steps, repeated across several adjacencies ---
      {
        const samples: number[] = [];
        let lastDelta = 0;
        let bytesA = 0;
        let bytesB = 0;
        const adjacencies = [1, 2, 3, 10, 25, 50, 100].filter((k) => k <= horizon);
        for (const k of adjacencies) {
          guard.check(`diff small ${name} k=${k}`);
          const a = worlds.find((w) => w.k === k - 1) ?? { ws: derive(canon, interventions.slice(0, k - 1)), repr: effectiveSemanticState(derive(canon, interventions.slice(0, k - 1))) };
          const b = worlds.find((w) => w.k === k) ?? { ws: derive(canon, interventions.slice(0, k)), repr: effectiveSemanticState(derive(canon, interventions.slice(0, k))) };
          for (let i = 0; i < 5; i++) {
            const t = time(() => worldDiff(a.ws, b.ws));
            samples.push(t.ms);
            lastDelta = deltaSize(t.value);
          }
          bytesA = bytesOf(a.repr);
          bytesB = bytesOf(b.repr);
        }
        rows.push({
          canon: name,
          regime: "small",
          reprBytesA: bytesA,
          reprBytesB: bytesB,
          deltaSize: lastDelta,
          diffMs: median(samples),
          reps: samples.length,
        });
        console.log(`[D] ${name} small repr~${fmtBytes(bytesA)} diff=${fmtMs(median(samples))} delta~${lastDelta}`);
      }

      // --- large-delta: baseline vs each checkpoint, grows with distance ---
      {
        const base = worlds[0]!;
        for (const w of worlds) {
          if (w.k === 0) continue;
          guard.check(`diff large ${name} k=${w.k}`);
          const samples: number[] = [];
          let lastDelta = 0;
          for (let i = 0; i < 5; i++) {
            const t = time(() => worldDiff(base.ws, w.ws));
            samples.push(t.ms);
            lastDelta = deltaSize(t.value);
          }
          rows.push({
            canon: name,
            regime: "large",
            reprBytesA: bytesOf(base.repr),
            reprBytesB: bytesOf(w.repr),
            deltaSize: lastDelta,
            diffMs: median(samples),
            reps: 5,
          });
          console.log(
            `[D] ${name} large k=${w.k} repr=${fmtBytes(bytesOf(w.repr))} ` +
              `diff=${fmtMs(median(samples))} delta=${lastDelta}`
          );
        }
      }
    }
    sampler.stop();
    return { env, rows, status: "ok" };
  } catch (err) {
    sampler.stop();
    if (err instanceof ResourceAbort) {
      return { env, rows, status: "aborted", abortNote: err.message };
    }
    throw err;
  }
}

export function writeDiffCost(result: DiffCostResult, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "exp-d-diffcost.json");
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}
