/**
 * S008 — run every phase and emit the report.
 *
 *   npx tsx experiments/s008/run-all.ts [--quick] [--only=EQ,MATRIX,BRANCH,DET,PERF]
 *
 * Deterministic from (canon, config, seed).
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { performance } from "node:perf_hooks";
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import { hashCanon } from "../../src/canon/hash";
import { constructedHistories, randomHistories, runEquivalence, summarize, type EquivalenceResult } from "./equivalence";
import { runMatrix } from "./matrix";
import { runBranchIsolation, type BranchIsolationResult } from "./branching";
import { runDeterminism, type DeterminismResult } from "./determinism";
import { runPerformance, type PerfRow } from "./performance";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "results");
const REPORT = join(HERE, "REPORT.md");

interface Args {
  quick: boolean;
  only: Set<string>;
}

function parseArgs(): Args {
  const quick = process.argv.includes("--quick");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg
    ? new Set(onlyArg.slice("--only=".length).split(","))
    : new Set(["EQ", "MATRIX", "BRANCH", "DET", "PERF"]);
  return { quick, only };
}

function commit(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: join(HERE, "..", "..") }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const cpus = os.cpus();
  const env = {
    commit: commit(),
    platform: process.platform,
    arch: process.arch,
    cpus: cpus.length,
    cpuModel: cpus[0]?.model ?? "unknown",
    totalMemBytes: os.totalmem(),
    node: process.version,
    ts: "5.9.3",
    timestamp: new Date().toISOString(),
  };
  mkdirSync(OUT, { recursive: true });

  console.log("=== S008 — Incremental Derivation Equivalence ===");
  console.log(`commit ${env.commit}`);
  console.log(`${env.cpuModel} | ${env.cpus} vCPU | ${(env.totalMemBytes / 1e9).toFixed(1)} GB | ${env.platform}/${env.arch}`);
  console.log(`mode: ${args.quick ? "quick" : "full"}\n`);

  const canons = args.quick ? (["verrin"] as const) : (["verrin", "ordos"] as const);

  let equivalence: EquivalenceResult[] = [];
  let matrix: EquivalenceResult[] = [];
  let branching: BranchIsolationResult[] = [];
  let determinism: DeterminismResult[] = [];
  let performanceRows: PerfRow[] = [];

  if (args.only.has("EQ")) {
    console.log("--- Phase 4: differential equivalence ---");
    const t0 = performance.now();
    for (const name of canons) {
      const canon = name === "verrin" ? verrinCanon() : ordosCanon();
      const results = runEquivalence(canon, name, [
        ...constructedHistories(canon),
        ...randomHistories(canon, args.quick ? 50 : 500, args.quick ? 10 : 20, 20260911),
      ]);
      equivalence.push(...results);
      const s = summarize(results);
      console.log(`[EQ] ${name}: ${s.passed}/${s.total} passed`);
    }
    console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);
  }

  if (args.only.has("MATRIX")) {
    console.log("--- Phase 5/6: adversarial matrix + invalid input ---");
    for (const name of canons) {
      const canon = name === "verrin" ? verrinCanon() : ordosCanon();
      const { results } = runMatrix(canon, name);
      matrix.push(...results);
      const s = summarize(results);
      console.log(`[MATRIX] ${name}: ${s.passed}/${s.total} passed`);
      for (const f of s.failed.slice(0, 20)) {
        console.log(`  FAIL ${f.name} note=${f.note ?? ""} semantic=${f.semanticEqual} hash=${f.hashEqual} diff=${f.diffEmpty} throw=${f.throwEqual}`);
      }
    }
    console.log("");
  }

  if (args.only.has("BRANCH")) {
    console.log("--- Phase 7: branch isolation ---");
    branching = runBranchIsolation({ canons: [...canons] });
    console.log("");
  }

  if (args.only.has("DET")) {
    console.log("--- Phase 8: determinism ---");
    determinism = runDeterminism({ canons: [...canons], trials: args.quick ? 3 : 5 });
    console.log("");
  }

  if (args.only.has("PERF")) {
    console.log("--- Phase 9/10: performance ---");
    performanceRows = runPerformance({
      canons: [...canons],
      horizons: args.quick ? [10, 100, 1000] : [10, 100, 1000, 10000, 100000],
      walkLimit: args.quick ? 1000 : 3000,
    });
    console.log("");
  }

  const files = {
    env,
    equivalence,
    matrix,
    branching,
    determinism,
    performance: performanceRows,
  };
  writeFileSync(join(OUT, "equivalence.json"), JSON.stringify({ env, equivalence }, null, 2), "utf8");
  writeFileSync(join(OUT, "matrix.json"), JSON.stringify({ env, matrix }, null, 2), "utf8");
  writeFileSync(join(OUT, "branching.json"), JSON.stringify({ env, branching }, null, 2), "utf8");
  writeFileSync(join(OUT, "determinism.json"), JSON.stringify({ env, determinism }, null, 2), "utf8");
  writeFileSync(join(OUT, "performance.json"), JSON.stringify({ env, performance: performanceRows }, null, 2), "utf8");

  writeFileSync(REPORT, renderReport(env, files), "utf8");
  console.log(`report: ${REPORT}`);
  void files;
}

function renderReport(
  env: { commit: string; platform: string; arch: string; cpus: number; cpuModel: string; totalMemBytes: number; node: string; ts: string; timestamp: string },
  f: {
    equivalence: EquivalenceResult[];
    matrix: EquivalenceResult[];
    branching: BranchIsolationResult[];
    determinism: DeterminismResult[];
    performance: PerfRow[];
  }
): string {
  const L: string[] = [];
  const eqS = summarize(f.equivalence);
  const mxS = summarize(f.matrix);
  L.push("# S008 — Incremental Derivation Equivalence");
  L.push("");
  L.push(`Generated: ${env.timestamp}`);
  L.push("");
  L.push("## 1. Starting commit and environment");
  L.push("");
  L.push("| Field | Value |");
  L.push("|---|---|");
  L.push(`| Commit | \`${env.commit}\` |`);
  L.push(`| CPU | ${env.cpuModel} |`);
  L.push(`| vCPU | ${env.cpus} |`);
  L.push(`| RAM | ${(env.totalMemBytes / 1e9).toFixed(1)} GB |`);
  L.push(`| OS | ${env.platform} ${env.arch} |`);
  L.push(`| Node | ${env.node} |`);
  L.push(`| TypeScript | ${env.ts} |`);
  L.push("");

  L.push("## 5. Differential-equivalence results");
  L.push("");
  L.push(`- Constructed + random histories: **${eqS.passed}/${eqS.total} passed**`);
  L.push(`- Adversarial matrix + invalid input: **${mxS.passed}/${mxS.total} passed**`);
  L.push("");
  if (eqS.failed.length > 0 || mxS.failed.length > 0) {
    L.push("### Failures");
    L.push("");
    L.push("| name | len | reduced | semantic | hash | diff | throw |");
    L.push("|---|---|---|---|---|---|---|");
    for (const r of [...eqS.failed, ...mxS.failed]) {
      L.push(`| ${r.name} | ${r.historyLen} | ${r.reducedLen} | ${r.semanticEqual} | ${r.hashEqual} | ${r.diffEmpty} | ${r.throwEqual} |`);
    }
    L.push("");
  }

  L.push("## 6. Invalid-input results");
  L.push("");
  const invalid = f.matrix.filter((r) => (r.note ?? "") === "invalid");
  if (invalid.length === 0) L.push("_(none recorded)_");
  else {
    L.push("| case | ok | throw-equal | semantic | hash | diff |");
    L.push("|---|---|---|---|---|---|");
    for (const r of invalid) {
      L.push(`| ${r.name} | ${r.ok} | ${r.throwEqual} | ${r.semanticEqual} | ${r.hashEqual} | ${r.diffEmpty} |`);
    }
  }
  L.push("");

  L.push("## 7. Branch-isolation results");
  L.push("");
  L.push("| canon | branches | depth | isolation | legacy match | convergence | distinct hashes |");
  L.push("|---|---|---|---|---|---|---|");
  for (const b of f.branching) {
    L.push(`| ${b.canon} | ${b.branchCount} | ${b.depth} | ${b.isolationOk} | ${b.hashesMatchLegacy} | ${b.convergenceOk} | ${b.distinctBranchHashes} |`);
  }
  L.push("");

  L.push("## 8. Determinism results");
  L.push("");
  L.push("| canon | trials | horizon | legacy stable | incremental stable | cross-equal | diff empty |");
  L.push("|---|---|---|---|---|---|---|");
  for (const d of f.determinism) {
    L.push(`| ${d.canon} | ${d.trials} | ${d.horizon} | ${d.legacyStable} | ${d.incrementalStable} | ${d.crossEqual} | ${d.diffEmpty} |`);
  }
  L.push("");

  L.push("## 9. Performance comparison");
  L.push("");
  L.push("| canon | H | legacy final | incr final | legacy walk | incr walk | incr iv/s | reduced chain | hashes match | peak RSS |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of f.performance) {
    L.push(
      `| ${r.canon} | ${r.h} | ${fmtMs(r.legacyFinalMs)} | ${fmtMs(r.incrementalFinalMs)} | ` +
        `${r.legacyWalkMs < 0 ? "—" : fmtMs(r.legacyWalkMs)} | ${r.incrementalWalkMs < 0 ? "—" : fmtMs(r.incrementalWalkMs)} | ` +
        `${r.incrementalWalkIps < 0 ? "—" : r.incrementalWalkIps.toFixed(0)} | ${r.reducedChainLen} | ${r.hashesMatch} | ${fmtBytes(r.peakRssBytes)} |`
    );
  }
  L.push("");
  return L.join("\n");
}

function fmtMs(ms: number): string {
  if (ms < 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 1) return `${ms.toFixed(1)} ms`;
  return `${(ms * 1000).toFixed(0)} µs`;
}

function fmtBytes(b: number): string {
  if (b < 0) return "—";
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
