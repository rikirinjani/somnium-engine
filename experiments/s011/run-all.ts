/**
 * S011 — run all phases and write results.json.
 *
 *   npx tsx experiments/s011/run-all.ts [--quick]
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { foldStateDeltas } from "../../src/derive/world-state";
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
import {
  differential,
  inverseAttack,
  coverage,
  classify,
  determinism,
  branchIsolation,
  cost,
  retainByFoldDelta,
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

function overlapCanon(): Canon {
  const F1 = "fact/x-at-loc1";
  const F2 = "fact/x-at-loc2";
  return {
    canonId: "canon/s011-overlap",
    version: "1.0.0",
    entities: [
      { id: "ev/a", kind: "Event", name: "A" },
      { id: "ev/b", kind: "Event", name: "B" },
      { id: "ev/c", kind: "Event", name: "C" },
      { id: "char/x", kind: "Character", name: "X" },
      { id: "loc/1", kind: "Location", name: "One" },
      { id: "loc/2", kind: "Location", name: "Two" },
    ],
    facts: [
      { id: F1, subject: "char/x", predicate: "at", object: "loc/1", validFrom: null, validTo: "ev/b", source: "canon" },
      { id: F2, subject: "char/x", predicate: "at", object: "loc/2", validFrom: "ev/a", validTo: null, source: "canon" },
    ],
    edges: [
      { id: "edge/b-requires-c", kind: "REQUIRES", from: "ev/c", to: "ev/b" },
      { id: "edge/c-requires-b", kind: "REQUIRES", from: "ev/b", to: "ev/c" },
    ],
    workBindings: [],
    hash: "",
  };
}

function constructed(canon: Canon): [string, Intervention[]][] {
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const e0 = events[0]!;
  const e1 = events[1] ?? events[0]!;
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
    ["force-then-negate (S010 witness)", [forceEvent(e0, "c"), negateEvent(e0, "c")]],
    ["negate-then-force", [negateEvent(e0, "c"), forceEvent(e0, "c")]],
    ["force-negate-force", [forceEvent(e0, "c"), negateEvent(e0, "c"), forceEvent(e0, "c")]],
    ["write-retract-write", [setFact(f0.subject, f0.predicate, "V1", "c"), retractFact(f0.id, "c"), setFact(f0.subject, f0.predicate, "V2", "c")]],
    ["retract-write-retract", [retractFact(f0.id, "c"), setFact(f0.subject, f0.predicate, "V", "c"), retractFact(f0.id, "c")]],
    ["negate-e0-negate-e1-negate-e0", [negateEvent(e0, "c"), negateEvent(e1, "c"), negateEvent(e0, "c")]],
    ["invalid:undeclared-subject", [setFact("nope/not-an-entity", "p", "V", "c")]],
    ["invalid:illegal-write-retract-write", [setFact("nope/x", "p", "V1", "c"), retractFact(f0.id, "c"), setFact("nope/x", "p", "V2", "c")]],
    ["force-undeclared", [forceEvent("nope/undeclared-event", "c")]],
  ];
  if (edges.length > 0) {
    out.push(["sever-add-sever", [severEdge(edges[0]!.id, "c"), addEdge({ ...edges[0]! }, "c"), severEdge(edges[0]!.id, "c")]]);
    out.push(["add-sever-add", [addEdge({ ...edges[0]! }, "c"), severEdge(edges[0]!.id, "c"), addEdge({ ...edges[0]! }, "c")]]);
  }
  if (ents.length > 1) out.push(["relocate", [relocate(ents[0]!, ents[1]!, "c")]]);
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

  console.log("=== S011 — Fold-State Delta / Retention Signal ===");
  console.log(`commit ${env.commit} | ${env.cpuModel} | ${env.cpus} vCPU\n`);

  // Phase 5/6 — witnesses
  const overlap = overlapCanon();
  const s009 = [setFact("char/x", "at", "W1", "s"), retractFact("fact/x-at-loc2", "s"), setFact("char/x", "at", "W2", "s")];
  const s010 = [forceEvent("ev/maren-return", "s"), negateEvent("ev/maren-return", "s")];
  const w = { s009: foldStateDeltas(overlap, s009), s010: foldStateDeltas(verrinCanon(), s010) };
  console.log(`[WITNESS S009] deltas: ${w.s009.map((d) => `${d.kind}[${d.components.join("|")}]`).join(", ")}`);
  console.log(`[WITNESS S010] deltas: ${w.s010.map((d) => `${d.kind}[${d.components.join("|")}]`).join(", ")}`);

  const nRandom = quick ? 100 : 500;
  const horizon = quick ? 12 : 25;

  const diffs: ReturnType<typeof differential>[] = [];
  const cov: { canon: string; rows: ReturnType<typeof coverage> }[] = [];
  const inv: ReturnType<typeof inverseAttack> = [];
  const cls: { canon: string; rows: ReturnType<typeof classify> }[] = [];
  const det: { canon: string; stable: boolean }[] = [];
  const branch: { canon: string; isolationOk: boolean; legacyMatch: boolean }[] = [];
  const costs: ReturnType<typeof cost> = [];

  const canons: [string, Canon][] = [
    ["verrin", verrinCanon()],
    ["ordos", ordosCanon()],
    ["overlap", overlap],
  ];

  for (const [name, canon] of canons) {
    const histories: [string, Intervention[]][] = [
      ...constructed(canon),
      ...Array.from({ length: nRandom }, (_, i) => [`random-${i}`, randomHistory(canon, horizon, 20260914 + i * 7919)] as [string, Intervention[]]),
    ];
    const d = differential(canon, name, histories);
    diffs.push(d);
    console.log(`[DIFF] ${name}: ${d.equivalent}/${d.cases}`);
    for (const f of d.failures.slice(0, 5)) console.log(`   FAIL ${f.name} len=${f.len} retained=${f.retained}`);

    cov.push({ canon: name, rows: coverage(canon, histories) });
    inv.push(...inverseAttack(canon, name, histories));
    cls.push({ canon: name, rows: histories.flatMap(([, H]) => classify(canon, H)) });

    if (name !== "overlap") {
      const detR = determinism(canon, randomHistory(canon, quick ? 100 : 400, 999), quick ? 3 : 5);
      det.push({ canon: name, stable: detR.stable });
      const prefix = randomHistory(canon, 10, 321);
      const evId = canon.entities.find((e) => e.kind === "Event")!.id;
      const f0 = canon.facts[0]!;
      const bR = branchIsolation(canon, prefix, [
        [negateEvent(evId, "b")],
        [setFact(f0.subject, f0.predicate, "B1", "b")],
        [retractFact(f0.id, "b")],
        [setFact(f0.subject, "s011_b", true, "b")],
      ]);
      branch.push({ canon: name, ...bR });
      costs.push(...cost(canon, name, quick ? [10, 100, 1000] : [10, 100, 1000, 3000], 20260914));
    }
  }
  for (const c of det) console.log(`[DET] ${c.canon}: stable=${c.stable}`);
  for (const b of branch) console.log(`[BRANCH] ${b.canon}: isolation=${b.isolationOk} legacyMatch=${b.legacyMatch}`);
  for (const c of costs) console.log(`[COST] ${c.canon} H=${c.h}: plain=${c.plainMs.toFixed(1)}ms instr=${c.instrumentedMs.toFixed(1)}ms overhead=${c.overhead.toFixed(2)}x`);

  // Inverse attack summary
  console.log(`\n[INVERSE] empty-delta-but-future-relevant hits: ${inv.length}`);
  for (const h of inv.slice(0, 10)) console.log(`   ${h.canon} #${h.index} ${h.kind}:${h.target}`);

  // Classification summary
  const catCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const g of cls) for (const r of g.rows) catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;
  console.log(`[CLASSIFY] A=${catCounts.A} B=${catCounts.B} C=${catCounts.C} D=${catCounts.D}`);

  const results = { env, witnesses: w, diffs, cov, inverse: inv.slice(0, 50), inverseCount: inv.length, classify: catCounts, det, branch, costs };
  const outPath = join(OUT, "results.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nresults: ${outPath}`);
}

main();
