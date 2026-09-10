/**
 * S007 — Experiment A: Linear Horizon
 *
 *   W0 -> I1 -> W1 -> I2 -> W2 -> ... -> WH
 *
 * Measures, for each horizon H:
 *   - single-shot derive of W_H (full chain applied in one call)
 *   - whole-chain derive (W_0 .. W_H, the production "step through" pattern)
 *   - representation size, stateHash time, diff-from-parent time
 *   - peak RSS
 *
 * The single-shot series answers "does constructing the FINAL state grow with
 * history?"; the chain series answers "does walking the history grow?"
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { hashState } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
import type { Intervention } from "../../src/timeline/types";
import {
  type EnvInfo,
  MemorySampler,
  ResourceGuard,
  ResourceAbort,
  bytesOf,
  fmtBytes,
  fmtMs,
  gb,
  time,
} from "./harness";
import { linearWorkload } from "./workloads";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface LinearRow {
  canon: string;
  h: number;
  seed: number;
  singleDeriveMs: number;
  singleDeriveIps: number; // interventions per second
  chainDeriveMs: number; // sum of W_0..W_H
  chainDeriveIps: number;
  reprBytes: number;
  stateHashMs: number;
  diffFromParentMs: number;
  diffFromParentEmpty: boolean;
  peakRssBytes: number;
  rssAfterBytes: number;
  status: "ok" | "partial" | "aborted";
  note?: string;
}

export interface LinearResult {
  env: EnvInfo;
  rows: LinearRow[];
}

const HORIZONS = [10, 100, 1000, 10000, 100000];

function runOne(
  canon: Canon,
  canonName: string,
  h: number,
  seed: number,
  guard: ResourceGuard,
  doChain: boolean
): LinearRow {
  const { interventions } = linearWorkload(canon, h, seed);
  const sampler = new MemorySampler(20);

  // --- Phase 1: single-shot derive of the FINAL world (always recorded) ---
  let singleMs: number;
  let reprBytes: number;
  let hashMs: number;
  let diffMs = 0;
  let diffEmpty = false;
  try {
    const full = interventions; // the prefix of length h IS the whole chain
    const single = time(() => derive(canon, full));
    singleMs = single.ms;
    const repr = effectiveSemanticState(single.value);
    reprBytes = bytesOf(repr);
    hashMs = time(() => hashState(repr)).ms;
    if (h > 0) {
      const parent = derive(canon, interventions.slice(0, h - 1));
      const d = time(() => worldDiff(parent, single.value));
      diffMs = d.ms;
      diffEmpty = d.value.hash === parent.stateHash ? true : isEmptyDiff(d.value);
    }
  } catch (err) {
    sampler.stop();
    if (err instanceof ResourceAbort) {
      return abortedRow(canonName, h, seed, err.message);
    }
    throw err;
  }

  // --- Phase 2: whole-chain walk (may exceed the budget; phase 1 is kept) ---
  // Skipped for horizons above `chainLimit`: the walk is O(H^2) and would starve
  // the single-derive measurements of larger horizons. Prefixes are built
  // incrementally so peak extra memory is O(H), not O(H^2).
  let chainMs = -1;
  let status: "ok" | "partial" = "ok";
  let note: string | undefined;
  if (doChain) {
    try {
      const chain = time(() => {
        const prefix: Intervention[] = [];
        let last = derive(canon, prefix);
        for (let k = 1; k <= h; k++) {
          guard.check(`linear H=${h} chain k=${k}`);
          prefix.push(interventions[k - 1]!);
          last = derive(canon, prefix);
        }
        return last;
      });
      chainMs = chain.ms;
    } catch (err) {
      if (err instanceof ResourceAbort) {
        status = "partial";
        note = err.message;
      } else {
        throw err;
      }
    }
  } else {
    note = `chain walk skipped (H > chainLimit)`;
  }

  const sample = sampler.stop();
  const rssNow = process.memoryUsage().rss;

  return {
    canon: canonName,
    h,
    seed,
    singleDeriveMs: singleMs,
    singleDeriveIps: singleMs > 0 ? h / (singleMs / 1000) : Infinity,
    chainDeriveMs: chainMs,
    chainDeriveIps: chainMs > 0 ? (h + 1) / (chainMs / 1000) : -1,
    reprBytes,
    stateHashMs: hashMs,
    diffFromParentMs: diffMs,
    diffFromParentEmpty: diffEmpty,
    peakRssBytes: sample.peakRssBytes,
    rssAfterBytes: rssNow,
    status,
    note,
  };
}

function abortedRow(canonName: string, h: number, seed: number, note: string): LinearRow {
  return {
    canon: canonName,
    h,
    seed,
    singleDeriveMs: -1,
    singleDeriveIps: -1,
    chainDeriveMs: -1,
    chainDeriveIps: -1,
    reprBytes: -1,
    stateHashMs: -1,
    diffFromParentMs: -1,
    diffFromParentEmpty: false,
    peakRssBytes: process.memoryUsage().rss,
    rssAfterBytes: process.memoryUsage().rss,
    status: "aborted",
    note,
  };
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

export function runLinear(
  env: EnvInfo,
  opts: {
    canons?: ("verrin" | "ordos")[];
    horizons?: number[];
    seed?: number;
    chainLimit?: number;
    maxRssBytes?: number;
    maxMs?: number;
  } = {}
): LinearResult {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const horizons = opts.horizons ?? HORIZONS;
  const seed = opts.seed ?? 20260910;
  const chainLimit = opts.chainLimit ?? 1000;
  const guard = new ResourceGuard({ maxRssBytes: opts.maxRssBytes, maxMs: opts.maxMs });
  const rows: LinearRow[] = [];

  for (const name of canons) {
    const canon = name === "verrin" ? verrinCanon() : ordosCanon();
    for (const h of horizons) {
      const row = runOne(canon, name, h, seed, guard, h <= chainLimit);
      rows.push(row);
      console.log(
        `[A] ${name} H=${h} single=${fmtMs(row.singleDeriveMs)} ` +
          `(${row.singleDeriveIps.toFixed(0)} iv/s) chain=${fmtMs(row.chainDeriveMs)} ` +
          `repr=${fmtBytes(row.reprBytes)} peak=${fmtBytes(row.peakRssBytes)} ${row.status}`
      );
      if (row.status === "aborted") {
        console.log(`    aborted: ${row.note}`);
        break; // do not attempt larger horizons once one aborts
      }
    }
  }
  return { env, rows };
}

export function writeLinear(result: LinearResult, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "exp-a-linear.json");
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}
