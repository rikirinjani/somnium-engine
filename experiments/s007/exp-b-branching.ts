/**
 * S007 — Experiment B: Branching
 *
 *                  W0
 *           ┌───────┼───────┐
 *           ↓       ↓       ↓
 *          W1a     W1b     W1c
 *         / | \     ...
 *
 * Builds a deterministic tree (depth D, branch factor B), derives every node,
 * and measures how the counterfactual state space behaves when it grows much
 * faster than the depth of any single trajectory.
 *
 * Memory is the binding constraint: total nodes = (B^(D+1) - 1)/(B - 1). A node
 * budget aborts cleanly rather than exhausting the host.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { hashState } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
import {
  type EnvInfo,
  MemorySampler,
  ResourceGuard,
  ResourceAbort,
  bytesOf,
  fmtBytes,
  fmtMs,
  time,
} from "./harness";
import { branchingWorkload, buildTargetPool } from "./workloads";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface BranchRow {
  canon: string;
  depth: number;
  branchFactor: number;
  seed: number;
  totalNodes: number;
  totalTrajectories: number;
  uniqueStates: number;
  duplicateStates: number;
  duplicateRate: number;
  generationMs: number;
  deriveMs: number;
  hashMs: number;
  throughputNodesPerSec: number;
  reprBytesMedian: number;
  peakRssBytes: number;
  rssAfterBytes: number;
  status: "ok" | "aborted";
  note?: string;
}

export interface BranchResult {
  env: EnvInfo;
  rows: BranchRow[];
}

const CONFIGS: { depth: number; branchFactor: number }[] = [
  { depth: 4, branchFactor: 2 },
  { depth: 6, branchFactor: 2 },
  { depth: 8, branchFactor: 2 },
  { depth: 10, branchFactor: 2 },
  { depth: 12, branchFactor: 2 },
  { depth: 3, branchFactor: 3 },
  { depth: 5, branchFactor: 3 },
  { depth: 7, branchFactor: 3 },
  { depth: 4, branchFactor: 4 },
  { depth: 6, branchFactor: 4 },
];

function runOne(
  canon: Canon,
  canonName: string,
  depth: number,
  branchFactor: number,
  seed: number,
  guard: ResourceGuard,
  maxNodes: number
): BranchRow {
  const sampler = new MemorySampler(20);
  try {
    // --- branch generation (workload construction itself) ---
    const gen = time(() => branchingWorkload(canon, depth, branchFactor, seed));
    const tree = gen.value;

    if (tree.nodes.length > maxNodes) {
      sampler.stop();
      return {
        canon: canonName,
        depth,
        branchFactor,
        seed,
        totalNodes: tree.nodes.length,
        totalTrajectories: tree.totalTrajectories,
        uniqueStates: -1,
        duplicateStates: -1,
        duplicateRate: -1,
        generationMs: gen.ms,
        deriveMs: -1,
        hashMs: -1,
        throughputNodesPerSec: -1,
        reprBytesMedian: -1,
        peakRssBytes: process.memoryUsage().rss,
        rssAfterBytes: process.memoryUsage().rss,
        status: "aborted",
        note: `node budget: ${tree.nodes.length} > ${maxNodes}`,
      };
    }

    // --- derive every node + hash its representation ---
    const stateHashes = new Set<string>();
    const reprSizes: number[] = [];
    let hashMs = 0;
    let reprBytesMedian = 0;

    const deriveT = time(() => {
      for (const node of tree.nodes) {
        guard.check(`branching D=${depth} B=${branchFactor} node=${node.id}`);
        const ws = derive(canon, node.interventions);
        const repr = effectiveSemanticState(ws);
        reprSizes.push(bytesOf(repr));
        const ht = time(() => hashState(repr));
        hashMs += ht.ms;
        stateHashes.add(ws.stateHash);
      }
    });

    reprSizes.sort((a, b) => a - b);
    reprBytesMedian = reprSizes.length > 0 ? reprSizes[Math.floor(reprSizes.length / 2)]! : 0;

    const sample = sampler.stop();
    const unique = stateHashes.size;
    const total = tree.nodes.length;

    return {
      canon: canonName,
      depth,
      branchFactor,
      seed,
      totalNodes: total,
      totalTrajectories: tree.totalTrajectories,
      uniqueStates: unique,
      duplicateStates: total - unique,
      duplicateRate: total > 0 ? (total - unique) / total : 0,
      generationMs: gen.ms,
      deriveMs: deriveT.ms,
      hashMs,
      throughputNodesPerSec: deriveT.ms > 0 ? total / (deriveT.ms / 1000) : Infinity,
      reprBytesMedian,
      peakRssBytes: sample.peakRssBytes,
      rssAfterBytes: process.memoryUsage().rss,
      status: "ok",
    };
  } catch (err) {
    sampler.stop();
    if (err instanceof ResourceAbort) {
      return {
        canon: canonName,
        depth,
        branchFactor,
        seed,
        totalNodes: -1,
        totalTrajectories: -1,
        uniqueStates: -1,
        duplicateStates: -1,
        duplicateRate: -1,
        generationMs: -1,
        deriveMs: -1,
        hashMs: -1,
        throughputNodesPerSec: -1,
        reprBytesMedian: -1,
        peakRssBytes: process.memoryUsage().rss,
        rssAfterBytes: process.memoryUsage().rss,
        status: "aborted",
        note: err.message,
      };
    }
    throw err;
  }
}

export function runBranching(
  env: EnvInfo,
  opts: {
    canons?: ("verrin" | "ordos")[];
    configs?: { depth: number; branchFactor: number }[];
    seed?: number;
    maxNodes?: number;
    maxRssBytes?: number;
    maxMs?: number;
  } = {}
): BranchResult {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const configs = opts.configs ?? CONFIGS;
  const seed = opts.seed ?? 20260910;
  const maxNodes = opts.maxNodes ?? 20000;
  const guard = new ResourceGuard({ maxRssBytes: opts.maxRssBytes, maxMs: opts.maxMs });
  const rows: BranchRow[] = [];

  for (const name of canons) {
    const canon = name === "verrin" ? verrinCanon() : ordosCanon();
    for (const cfg of configs) {
      const row = runOne(canon, name, cfg.depth, cfg.branchFactor, seed, guard, maxNodes);
      rows.push(row);
      console.log(
        `[B] ${name} D=${cfg.depth} B=${cfg.branchFactor} nodes=${row.totalNodes} ` +
          `unique=${row.uniqueStates} dup=${(row.duplicateRate * 100).toFixed(1)}% ` +
          `derive=${fmtMs(row.deriveMs)} peak=${fmtBytes(row.peakRssBytes)} ${row.status}`
      );
      if (row.status === "aborted" && row.note?.startsWith("RSS")) break;
    }
  }
  return { env, rows };
}

export function writeBranching(result: BranchResult, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "exp-b-branching.json");
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}
