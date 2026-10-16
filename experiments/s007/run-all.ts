/**
 * S007 — run all experiments and emit the report.
 *
 * Usage:
 *   npx tsx experiments/s007/run-all.ts [--quick] [--only=A,B,C,D,E]
 *
 * Determinism: every experiment is seeded. Two runs with the same flags on the
 * same commit produce identical semantic results (hashes); only timings vary.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectEnv, gb, fmtBytes } from "./harness";
import { runLinear, writeLinear, type LinearResult } from "./exp-a-linear";
import { runBranching, writeBranching, type BranchResult } from "./exp-b-branching";
import { runConvergence, writeConvergence, type ConvergenceResult } from "./exp-c-convergence";
import { runDiffCost, writeDiffCost, type DiffCostResult } from "./exp-d-diffcost";
import { runParallel, writeParallel, type ParallelResult } from "./exp-e-parallel";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "results");
const REPORT = join(HERE, "REPORT.md");

function commitHash(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: join(HERE, "..", "..") }).toString().trim();
  } catch {
    return "unknown";
  }
}

interface Args {
  quick: boolean;
  only: Set<string>;
}

function parseArgs(): Args {
  const quick = process.argv.includes("--quick");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : new Set(["A", "B", "C", "D", "E"]);
  return { quick, only };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const env = collectEnv(commitHash());
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("=== S007 Long-Horizon Semantic State Scaling ===");
  console.log(`commit ${env.commit}`);
  console.log(`${env.cpuModel} | ${env.cpus} vCPU | ${gb(env.totalMemBytes).toFixed(1)} GB RAM | ${env.platform}/${env.arch}`);
  console.log(`node ${env.nodeVersion}`);
  console.log(`mode: ${args.quick ? "quick" : "full"}\n`);

  let linear: LinearResult | undefined;
  let branch: BranchResult | undefined;
  let converge: ConvergenceResult | undefined;
  let diffcost: DiffCostResult | undefined;
  let parallel: ParallelResult | undefined;

  // Bounded defaults for constrained hosts; --quick shrinks further.
  const maxRssBytes = args.quick ? 1.2e9 : 3.5e9;
  const maxMs = args.quick ? 120_000 : 900_000;

  if (args.only.has("A")) {
    console.log("--- Experiment A: Linear Horizon ---");
    linear = runLinear(env, {
      // Full ladder per spec. Chain walks (O(H^2)) are capped at chainLimit so
      // the larger single-derives are not starved.
      horizons: args.quick ? [10, 100, 1000, 3000] : [10, 100, 1000, 3000, 10000, 100000],
      chainLimit: args.quick ? 3000 : 3000,
      maxRssBytes,
      maxMs,
    });
    console.log(`written: ${writeLinear(linear, OUT_DIR)}\n`);
  }

  if (args.only.has("B")) {
    console.log("--- Experiment B: Branching ---");
    branch = runBranching(env, {
      configs: args.quick
        ? [
            { depth: 4, branchFactor: 2 },
            { depth: 6, branchFactor: 2 },
            { depth: 3, branchFactor: 3 },
          ]
        : [
            { depth: 4, branchFactor: 2 },
            { depth: 6, branchFactor: 2 },
            { depth: 8, branchFactor: 2 },
            { depth: 3, branchFactor: 3 },
            { depth: 5, branchFactor: 3 },
            { depth: 4, branchFactor: 4 },
          ],
      maxNodes: args.quick ? 500 : 5000,
      maxRssBytes,
      maxMs,
    });
    console.log(`written: ${writeBranching(branch, OUT_DIR)}\n`);
  }

  if (args.only.has("C")) {
    console.log("--- Experiment C: Convergence ---");
    converge = runConvergence(env, {
      historyCounts: args.quick ? [10, 100, 500] : [10, 100, 1000, 5000],
      horizon: args.quick ? 5 : 10,
      maxRssBytes,
      maxMs,
    });
    console.log(`written: ${writeConvergence(converge, OUT_DIR)}\n`);
  }

  if (args.only.has("D")) {
    console.log("--- Experiment D: WorldDiff Cost ---");
    diffcost = runDiffCost(env, {
      horizon: args.quick ? 100 : 500,
      equalReps: args.quick ? 20 : 50,
      maxRssBytes,
      maxMs,
    });
    console.log(`written: ${writeDiffCost(diffcost, OUT_DIR)}\n`);
  }

  if (args.only.has("E")) {
    console.log("--- Experiment E: Parallel Scaling ---");
    parallel = await runParallel(env, {
      workerCounts: args.quick ? [1, 2, 4] : [1, 2, 4, 8, 16],
      items: args.quick ? 50 : 200,
      horizon: args.quick ? 10 : 20,
      maxRssBytes,
      maxMs,
    });
    console.log(`written: ${writeParallel(parallel, OUT_DIR)}\n`);
  }

  writeFileSync(
    REPORT,
    renderReport(env, { linear, branch, converge, diffcost, parallel }),
    "utf8"
  );
  console.log(`report: ${REPORT}`);
}

/* ------------------------------------------------------------------ */
/* Report rendering                                                    */
/* ------------------------------------------------------------------ */

function renderReport(
  env: ReturnType<typeof collectEnv>,
  r: {
    linear?: LinearResult;
    branch?: BranchResult;
    converge?: ConvergenceResult;
    diffcost?: DiffCostResult;
    parallel?: ParallelResult;
  }
): string {
  const L: string[] = [];
  L.push("# S007 — Long-Horizon Semantic State Scaling");
  L.push("");
  L.push(`Generated: ${new Date().toISOString()}`);
  L.push("");
  L.push("## 1. Environment");
  L.push("");
  L.push("| Field | Value |");
  L.push("|---|---|");
  L.push(`| Commit | \`${env.commit}\` |`);
  L.push(`| CPU | ${env.cpuModel} |`);
  L.push(`| vCPU | ${env.cpus} |`);
  L.push(`| RAM | ${gb(env.totalMemBytes).toFixed(1)} GB (${gb(env.freeMemBytes).toFixed(1)} GB free at start) |`);
  L.push(`| OS | ${env.platform} ${env.arch} |`);
  L.push(`| Node | ${env.nodeVersion} |`);
  L.push(`| TypeScript | ${env.tsVersion} |`);
  L.push("");

  if (r.linear) {
    L.push("## 3. Linear Scaling (Experiment A)");
    L.push("");
    L.push("| Canon | H | single derive | iv/s | chain derive | repr size | stateHash | diff(parent) | peak RSS | status |");
    L.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const row of r.linear.rows) {
      L.push(
        `| ${row.canon} | ${row.h} | ${fmtMs(row.singleDeriveMs)} | ${row.singleDeriveIps.toFixed(0)} | ` +
          `${fmtMs(row.chainDeriveMs)} | ${fmtBytes(row.reprBytes)} | ${fmtMs(row.stateHashMs)} | ` +
          `${fmtMs(row.diffFromParentMs)} | ${fmtBytes(row.peakRssBytes)} | ${row.status} |`
      );
    }
    L.push("");
  }

  if (r.branch) {
    L.push("## 4. Branching Scaling (Experiment B)");
    L.push("");
    L.push("| Canon | D | B | nodes | trajectories | unique | dup rate | generation | derive | throughput | peak RSS | status |");
    L.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const row of r.branch.rows) {
      L.push(
        `| ${row.canon} | ${row.depth} | ${row.branchFactor} | ${row.totalNodes} | ${row.totalTrajectories} | ` +
          `${row.uniqueStates} | ${(row.duplicateRate * 100).toFixed(1)}% | ${fmtMs(row.generationMs)} | ` +
          `${fmtMs(row.deriveMs)} | ${row.throughputNodesPerSec.toFixed(0)}/s | ${fmtBytes(row.peakRssBytes)} | ${row.status} |`
      );
    }
    L.push("");
  }

  if (r.converge) {
    L.push("## 5. Convergence (Experiment C)");
    L.push("");
    L.push("### Constructed groups");
    L.push("");
    L.push("| Canon | Group | histories | distinct hashes | converged | pairwise diff empty |");
    L.push("|---|---|---|---|---|---|");
    for (const g of r.converge.groups) {
      L.push(`| ${g.canon} | ${g.label} | ${g.histories} | ${g.distinctHashes} | ${g.converged} | ${g.pairwiseDiffEmpty} |`);
    }
    L.push("");
    L.push("### Random histories at scale");
    L.push("");
    L.push("| Canon | histories | horizon | distinct states | ratio | max/state | median/state | peak RSS |");
    L.push("|---|---|---|---|---|---|---|---|");
    for (const row of r.converge.atScale) {
      L.push(
        `| ${row.canon} | ${row.histories} | ${row.horizon} | ${row.distinctStates} | ` +
          `${row.convergenceRatio.toFixed(4)} | ${row.maxHistoriesPerState} | ${row.medianHistoriesPerState} | ${fmtBytes(row.peakRssBytes)} |`
      );
    }
    L.push("");
  }

  if (r.diffcost) {
    L.push("## 6. WorldDiff Scaling (Experiment D)");
    L.push("");
    L.push("| Canon | regime | repr A | repr B | delta | diff time |");
    L.push("|---|---|---|---|---|---|");
    for (const row of r.diffcost.rows) {
      L.push(
        `| ${row.canon} | ${row.regime} | ${fmtBytes(row.reprBytesA)} | ${fmtBytes(row.reprBytesB)} | ` +
          `${row.deltaSize} | ${fmtMs(row.diffMs)} |`
      );
    }
    L.push("");
  }

  if (r.parallel) {
    L.push("## 7. Parallel Scaling (Experiment E)");
    L.push("");
    L.push("| Canon | workers | items | cold start | warm wall | throughput | speedup | efficiency | hashes match | status |");
    L.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const row of r.parallel.rows) {
      L.push(
        `| ${row.canon} | ${row.workers} | ${row.items} | ${fmtMs(row.coldStartMs)} | ${fmtMs(row.warmWallMs)} | ` +
          `${row.throughputItemsPerSec.toFixed(1)}/s | ${row.speedup.toFixed(2)}x | ${(row.efficiency * 100).toFixed(0)}% | ` +
          `${row.hashesMatch} | ${row.status} |`
      );
    }
    L.push("");
  }

  L.push("## 8. Bottleneck Analysis");
  L.push("");
  L.push("_See findings below; populated from the measurements above._");
  L.push("");
  return L.join("\n");
}

function fmtMs(ms: number): string {
  if (ms < 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  return `${(ms * 1000).toFixed(1)} µs`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
