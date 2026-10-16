/**
 * S009 — run all checks and write results.json.
 *
 *   npx tsx experiments/s009/run-all.ts [--quick]
 *
 * REPORT.md is written separately (it needs narrative judgement, not templating).
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
import { runAttacks, multiFactCells, type CaseResult } from "./counterexamples";
import { runOverlapCounterexample, runOverlapCounterexampleGuarded } from "./synthetic";
import {
  checkIdempotence,
  checkSufficiency,
  checkDeterminism,
  checkBranchIsolation,
  checkCommutation,
  coverage,
  randomHistory,
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
    // invalid / unknown / contradiction preservation
    ["invalid:undeclared-subject", [setFact("nope/not-an-entity", "p", "V", "c")]],
    ["invalid:id-shaped-object", [setFact(f0.subject, f0.predicate, "not/a/declared/thing", "c")]],
    ["invalid:then-legal", [setFact("nope/not-an-entity", "p", "V", "c"), setFact(f0.subject, f0.predicate, f0.object, "c")]],
    ["invalid:legal-then-illegal", [setFact(f0.subject, f0.predicate, f0.object, "c"), setFact("nope/not-an-entity", "p", "V", "c")]],
    ["invalid:illegal-write-retract-write", [setFact("nope/x", "p", "V1", "c"), retractFact(f0.id, "c"), setFact("nope/x", "p", "V2", "c")]],
    ["invalid:force-undeclared", [forceEvent("nope/undeclared-event", "c")]],
    ["contradiction:force-then-negate", [forceEvent(e0, "c"), negateEvent(e0, "c")]],
    ["contradiction:negate-then-force", [negateEvent(e0, "c"), forceEvent(e0, "c")]],
  ];
  if (edges.length > 0) {
    out.push(["sever-add-sever", [severEdge(edges[0]!.id, "c"), addEdge({ ...edges[0]! }, "c"), severEdge(edges[0]!.id, "c")]]);
  }
  if (ents.length > 0) {
    out.push(["relocate", [relocate(s0, ents[0]!, "c")]]);
  }
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

  console.log("=== S009 — Subsumption Semantics / Reduced-History Sufficiency ===");
  console.log(`commit ${env.commit} | ${env.cpuModel} | ${env.cpus} vCPU | ${env.platform}\n`);

  const canons: [string, Canon][] = [
    ["verrin", verrinCanon()],
    ["ordos", ordosCanon()],
  ];

  const allAttacks: { canon: string; results: CaseResult[]; multiFact: ReturnType<typeof multiFactCells> }[] = [];
  const idem: ReturnType<typeof checkIdempotence>[] = [];
  const suff: ReturnType<typeof checkSufficiency>[] = [];
  const det: ReturnType<typeof checkDeterminism>[] = [];
  const branch: ReturnType<typeof checkBranchIsolation>[] = [];
  const commute: ReturnType<typeof checkCommutation> = [];
  const cov: { canon: string; rows: ReturnType<typeof coverage> }[] = [];

  const nRandom = quick ? 100 : 1000;
  const horizon = quick ? 12 : 25;

  for (const [name, canon] of canons) {
    const attacks = runAttacks(canon);
    const mf = multiFactCells(canon);
    allAttacks.push({ canon: name, results: attacks, multiFact: mf });
    const aFail = attacks.filter((r) => !r.ok);
    console.log(`[ATTACK] ${name}: ${attacks.length - aFail.length}/${attacks.length} passed; multi-fact cells=${mf.length}`);
    for (const f of aFail) console.log(`  FAIL [${f.rule}] ${f.name}`);

    const histories: [string, Intervention[]][] = [
      ...constructed(canon),
      ...Array.from(
        { length: nRandom },
        (_, i) => [`random-${i}`, randomHistory(canon, horizon, 20260912 + i * 7919)] as [string, Intervention[]]
      ),
    ];

    const i = checkIdempotence(canon, name, histories);
    idem.push(i);
    console.log(`[IDEMPOTENCE] ${name}: ${i.idempotent}/${i.cases}`);

    const s = checkSufficiency(canon, name, histories);
    suff.push(s);
    console.log(`[SUFFICIENCY] ${name}: ${s.equivalent}/${s.cases}`);
    for (const f of s.failures.slice(0, 10)) console.log(`  FAIL ${f.name} len=${f.len} reduced=${f.reduced}`);

    const d = checkDeterminism(canon, name, randomHistory(canon, quick ? 100 : 500, 424242), quick ? 3 : 5);
    det.push(d);
    console.log(`[DETERMINISM] ${name}: stable=${d.stable} reducedLen=${d.sampleLen}`);

    const prefix = randomHistory(canon, 10, 111);
    const evId = canon.entities.find((e) => e.kind === "Event")!.id;
    const f0 = canon.facts[0]!;
    const branches: Intervention[][] = [
      [negateEvent(evId, "b")],
      [setFact(f0.subject, f0.predicate, "B1", "b")],
      [retractFact(f0.id, "b")],
      [setFact(f0.subject, "s009_b", true, "b")],
    ];
    const b = checkBranchIsolation(canon, name, prefix, branches);
    branch.push(b);
    console.log(`[BRANCH] ${name}: isolation=${b.isolationOk} legacyMatch=${b.legacyMatch}`);

    commute.push(
      ...checkCommutation(canon, name, [
        ["negate(e0) vs force(e0)", negateEvent(evId, "x"), forceEvent(evId, "x")],
        ["write(cellA) vs write(cellB)", setFact(f0.subject, f0.predicate, "A", "x"), setFact(f0.subject, "s009_other", "B", "x")],
        ["retract(f0) vs write(cellA)", retractFact(f0.id, "x"), setFact(f0.subject, f0.predicate, "A", "x")],
        ["negate(e0) vs write(cellA)", negateEvent(evId, "x"), setFact(f0.subject, f0.predicate, "A", "x")],
      ])
    );

    cov.push({ canon: name, rows: coverage(canon, histories) });
  }

  const cex = runOverlapCounterexample();
  const cexGuarded = runOverlapCounterexampleGuarded();
  console.log(`\n[COUNTEREXAMPLE] R1 unguarded diverges: ${cex.counterexample}; guarded: ${cexGuarded.counterexample}`);

  const results = { env, allAttacks, idem, suff, det, branch, commute, cov, cex, cexGuarded };
  const outPath = join(OUT, "results.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nresults: ${outPath}`);
}

main();
