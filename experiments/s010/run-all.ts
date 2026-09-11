/**
 * S010 — run all phases and write results.json.
 *
 *   npx tsx experiments/s010/run-all.ts [--quick]
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import {
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
  relocate,
  type Intervention,
} from "../../src/timeline/types";
import { runCounterexample } from "./synthetic";
import {
  differential,
  runStress,
  coverage,
  determinism,
  branchIsolation,
  scaling,
  randomHistory,
  multiFactStress,
  type DiffRow,
} from "./checks";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "results");

function commit(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: join(HERE, "..", "..") }).toString().trim();
  } catch {
    return "unknown";
  }
}

function constructed(canon: Canon): [string, Intervention[]][] {
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const e0 = events[0]!;
  const s0 = ents[0]!;
  const f0 = facts[0]!;
  const out: [string, Intervention[]][] = [
    ["empty", []],
    ["negate", [negateEvent(e0, "c")]],
    ["force", [forceEvent(e0, "c")]],
    ["retract", [retractFact(f0.id, "c")]],
    ["write", [setFact(f0.subject, f0.predicate, "V", "c")]],
    ["negate x4", Array.from({ length: 4 }, () => negateEvent(e0, "c"))],
    ["retract x4", Array.from({ length: 4 }, () => retractFact(f0.id, "c"))],
    ["write x4", Array.from({ length: 4 }, () => setFact(f0.subject, f0.predicate, "V", "c"))],
    ["write-retract-write", [setFact(f0.subject, f0.predicate, "V1", "c"), retractFact(f0.id, "c"), setFact(f0.subject, f0.predicate, "V2", "c")]],
    ["retract-write-retract", [retractFact(f0.id, "c"), setFact(f0.subject, f0.predicate, "V", "c"), retractFact(f0.id, "c")]],
    ["negate-force-negate", [negateEvent(e0, "c"), forceEvent(e0, "c"), negateEvent(e0, "c")]],
    ["invalid:undeclared-subject", [setFact("nope/not-an-entity", "p", "V", "c")]],
    ["invalid:then-legal", [setFact("nope/not-an-entity", "p", "V", "c"), setFact(f0.subject, f0.predicate, f0.object, "c")]],
    ["invalid:legal-then-illegal", [setFact(f0.subject, f0.predicate, f0.object, "c"), setFact("nope/not-an-entity", "p", "V", "c")]],
    ["force-undeclared", [forceEvent("nope/undeclared-event", "c")]],
  ];
  if (edges.length > 0) {
    out.push(["sever-add-sever", [severEdge(edges[0]!.id, "c"), addEdge({ ...edges[0]! }, "c"), severEdge(edges[0]!.id, "c")]]);
  }
  if (ents.length > 1) out.push(["relocate", [relocate(s0, ents[1]!, "c")]]);
  return out;
}

function main(): void {
  const quick = process.argv.includes("--quick");
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

  console.log("=== S010 — Fold-Derived Sufficient History ===");
  console.log(`commit ${env.commit} | ${env.cpuModel} | ${env.cpus} vCPU\n`);

  // Phase 4 — counterexample
  const cex = runCounterexample();
  console.log(`[CEX] reproduced: legacy=${cex.legacyHash} facts=${JSON.stringify(cex.legacyFacts)}`);
  for (const m of cex.mechanisms) {
    console.log(`  ${m.name}: retained=${m.retainedLen} semanticEqual=${m.semanticEqual} hashEqual=${m.hashEqual} diffEmpty=${m.diffEmpty}`);
  }

  const nRandom = quick ? 100 : 500;
  const horizon = quick ? 12 : 25;

  // Phase 6 — differential equivalence
  const diffs: DiffRow[] = [];
  const cov: { canon: string; rows: ReturnType<typeof coverage> }[] = [];
  const det: ReturnType<typeof determinism> = [];
  const branch: ReturnType<typeof branchIsolation> = [];
  for (const [name, canon] of [["verrin", verrinCanon()], ["ordos", ordosCanon()]] as [string, Canon][]) {
    const histories: [string, Intervention[]][] = [
      ...constructed(canon),
      ...Array.from({ length: nRandom }, (_, i) => [`random-${i}`, randomHistory(canon, horizon, 20260913 + i * 7919)] as [string, Intervention[]]),
    ];
    const rows = differential(canon, name, histories);
    diffs.push(...rows);
    for (const r of rows) console.log(`[DIFF] ${r.canon} ${r.mechanism}: ${r.equivalent}/${r.cases}`);

    cov.push({ canon: name, rows: coverage(canon, histories) });
    det.push(...determinism(canon, name, randomHistory(canon, quick ? 100 : 400, 555), quick ? 3 : 5));

    const prefix = randomHistory(canon, 10, 777);
    const evId = canon.entities.find((e) => e.kind === "Event")!.id;
    const f0 = canon.facts[0]!;
    branch.push(
      ...branchIsolation(canon, name, prefix, [
        [negateEvent(evId, "b")],
        [setFact(f0.subject, f0.predicate, "B1", "b")],
        [retractFact(f0.id, "b")],
        [setFact(f0.subject, "s010_b", true, "b")],
      ])
    );
  }
  for (const d of det) console.log(`[DET] ${d.canon} ${d.mechanism}: stable=${d.stable}`);
  for (const b of branch) console.log(`[BRANCH] ${b.canon} ${b.mechanism}: isolation=${b.isolationOk} legacyMatch=${b.legacyMatch}`);

  // Phase 7 — multi-fact stress
  const stress = runStress(multiFactStress());
  for (const r of stress) console.log(`[STRESS] ${r.mechanism}: ${r.equivalent}/${r.cases} (failures: ${r.failures.map((f) => f.name).join(", ") || "none"})`);

  // Phase 10 — scaling. M-H is O(H^2) oracle calls, so its scaling is capped;
  // M-B (accumulator-only) is cheap and is the only mechanism run at large H.
  const scale = scaling(verrinCanon(), "verrin", quick ? [10, 100, 1000] : [10, 100, 1000, 3000], 20260913);
  for (const s of scale) console.log(`[SCALE] ${s.canon} H=${s.h} ${s.mechanism}: retained=${s.retained} (${(s.fraction * 100).toFixed(1)}%)`);

  const results = { env, cex, diffs, stress, cov, det, branch, scale };
  const outPath = join(OUT, "results.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nresults: ${outPath}`);
}

main();
