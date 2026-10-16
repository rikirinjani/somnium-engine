/**
 * S014 — Fold-State Delta / Long-Horizon Timeline Traversal.
 *
 * Retained traversal: keep an intervention iff its authoritative FoldStateDelta
 * is non-empty; every prefix world is then obtained by `derive` over the retained
 * prefix. `derive` remains the only semantic authority.
 *
 * CRITICAL: this is about PREFIX correctness, not just the terminal state.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { performance } from "node:perf_hooks";
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive, foldStateDeltas, type WorldState } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
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

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "results");

function sameWorld(a: WorldState, b: WorldState): boolean {
  if (a.stateHash !== b.stateHash) return false;
  if (canonicalJson(effectiveSemanticState(a)) !== canonicalJson(effectiveSemanticState(b))) return false;
  const d = worldDiff(a, b);
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

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic history with a controllable retention density. */
function history(canon: Canon, h: number, seed: number, density: "sparse" | "medium" | "dense"): Intervention[] {
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
    if (density === "sparse") {
      // repeat the same few operations -> mostly empty deltas
      out.push(k % 2 === 0 ? forceEvent(pick(evs), "r") : addEdge({ ...pick(edges) }, "r"));
      continue;
    }
    if (roll < 0.4 && ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), objs.length > 0 ? pick(objs) : true, "r"));
    else if (roll < 0.55 && evs.length > 0) out.push(negateEvent(pick(evs), "r"));
    else if (roll < 0.7 && evs.length > 0) out.push(forceEvent(pick(evs), "r"));
    else if (roll < 0.82 && factIds.length > 0) out.push(retractFact(pick(factIds), "r"));
    else if (roll < 0.92 && edges.length > 0) out.push(severEdge(pick(edges).id, "r"));
    else if (edges.length > 0) out.push(addEdge({ ...pick(edges) }, "r"));
    else if (ents.length > 0 && preds.length > 0) out.push(setFact(pick(ents), pick(preds), true, "r"));
  }
  return out;
}

interface TraversalRow {
  canon: string;
  density: string;
  h: number;
  retained: number;
  ratio: number;
  prefixesChecked: number;
  prefixMismatches: number;
  legacyMs: number;
  retainedMs: number;
  speedup: number;
  finalHashMatch: boolean;
  peakRssBytes: number;
}

function traverse(canon: Canon, name: string, H: Intervention[], density: string, checkAll: boolean, sample: number): TraversalRow {
  const t0 = performance.now();
  const deltas = foldStateDeltas(canon, H);
  const flags = deltas.map((d) => d.components.length > 0);
  const retained = flags.filter(Boolean).length;
  const peak = { v: process.memoryUsage().rss };

  // prefix indices to check
  const idx: number[] = [];
  if (checkAll) for (let i = 0; i <= H.length; i++) idx.push(i);
  else {
    const rand = rng(4242);
    for (let k = 0; k < sample; k++) idx.push(Math.floor(rand() * (H.length + 1)));
    idx.push(0, H.length);
  }
  idx.sort((a, b) => a - b);

  let mismatches = 0;
  // legacy traversal
  const l0 = performance.now();
  const legacyWorlds: WorldState[] = [];
  for (const i of idx) legacyWorlds.push(derive(canon, H.slice(0, i)));
  const legacyMs = performance.now() - l0;
  peak.v = Math.max(peak.v, process.memoryUsage().rss);

  // retained traversal
  const r0 = performance.now();
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]!;
    const retainedPrefix = H.slice(0, i).filter((_, j) => flags[j] === true);
    const w = derive(canon, retainedPrefix);
    if (!sameWorld(legacyWorlds[k]!, w)) mismatches++;
  }
  const retainedMs = performance.now() - r0;
  peak.v = Math.max(peak.v, process.memoryUsage().rss);

  const finalLegacy = derive(canon, H);
  const finalRetained = derive(canon, H.filter((_, j) => flags[j] === true));

  return {
    canon: name,
    density,
    h: H.length,
    retained,
    ratio: H.length > 0 ? retained / H.length : 0,
    prefixesChecked: idx.length,
    prefixMismatches: mismatches,
    legacyMs,
    retainedMs,
    speedup: retainedMs > 0 ? legacyMs / retainedMs : 0,
    finalHashMatch: finalLegacy.stateHash === finalRetained.stateHash,
    peakRssBytes: peak.v,
  };
}

function main(): void {
  const cpus = os.cpus();
  const env = {
    commit: execSync("git rev-parse HEAD", { cwd: join(HERE, "..", "..") }).toString().trim(),
    platform: process.platform,
    cpus: cpus.length,
    cpuModel: cpus[0]?.model ?? "unknown",
    totalMemBytes: os.totalmem(),
    node: process.version,
    ts: "5.9.3",
    timestamp: new Date().toISOString(),
  };
  mkdirSync(OUT, { recursive: true });
  const quick = process.argv.includes("--quick");
  console.log("=== S014 — Fold-State Delta / Long-Horizon Timeline Traversal ===");
  console.log(`commit ${env.commit} | ${cpus[0]?.model} | ${cpus.length} vCPU\n`);

  const rows: TraversalRow[] = [];
  const canons: [string, Canon][] = [["verrin", verrinCanon()], ["ordos", ordosCanon()]];

  // Phase 5/6 — prefix correctness + long horizons
  const horizons = quick ? [100, 1000] : [1000, 3000, 10000];
  for (const [name, canon] of canons) {
    for (const h of horizons) {
      const H = history(canon, h, 20260917, "medium");
      const r = traverse(canon, name, H, "medium", h <= 3000, quick ? 50 : 300);
      rows.push(r);
      console.log(
        `[TRAVERSE] ${name} H=${h} retained=${r.retained} (${(r.ratio * 100).toFixed(1)}%) ` +
          `prefixes=${r.prefixesChecked} mismatches=${r.prefixMismatches} ` +
          `legacy=${r.legacyMs.toFixed(0)}ms retained=${r.retainedMs.toFixed(0)}ms speedup=${r.speedup.toFixed(2)}x`
      );
    }
  }

  // Phase 7 — density
  for (const [name, canon] of canons) {
    for (const density of ["sparse", "medium", "dense"] as const) {
      const H = history(canon, quick ? 500 : 2000, 20260918, density);
      const r = traverse(canon, name, H, density, true, 0);
      rows.push(r);
      console.log(
        `[DENSITY] ${name} ${density} H=${H.length} retained=${r.retained} (${(r.ratio * 100).toFixed(1)}%) ` +
          `mismatches=${r.prefixMismatches} speedup=${r.speedup.toFixed(2)}x`
      );
    }
  }

  // Phase 11 — S009 / S010 witnesses (prefix-correct)
  const overlap: Canon = {
    canonId: "canon/s014-overlap",
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
      { id: "fact/x-at-loc1", subject: "char/x", predicate: "at", object: "loc/1", validFrom: null, validTo: "ev/b", source: "canon" },
      { id: "fact/x-at-loc2", subject: "char/x", predicate: "at", object: "loc/2", validFrom: "ev/a", validTo: null, source: "canon" },
    ],
    edges: [
      { id: "edge/b-requires-c", kind: "REQUIRES", from: "ev/c", to: "ev/b" },
      { id: "edge/c-requires-b", kind: "REQUIRES", from: "ev/b", to: "ev/c" },
    ],
    workBindings: [],
    hash: "",
  };
  const s009 = [setFact("char/x", "at", "W1", "s"), retractFact("fact/x-at-loc2", "s"), setFact("char/x", "at", "W2", "s")];
  const s010 = [forceEvent("ev/maren-return", "s"), negateEvent("ev/maren-return", "s")];
  const w009 = traverse(overlap, "overlap", s009, "witness", true, 0);
  const w010 = traverse(verrinCanon(), "verrin", s010, "witness", true, 0);
  rows.push(w009, w010);
  console.log(`[WITNESS S009] prefixes=${w009.prefixesChecked} mismatches=${w009.prefixMismatches}`);
  console.log(`[WITNESS S010] prefixes=${w010.prefixesChecked} mismatches=${w010.prefixMismatches}`);

  // Phase 10 — branch isolation
  const base = history(verrinCanon(), 200, 20260919, "medium");
  const flagsBase = foldStateDeltas(verrinCanon(), base).map((d) => d.components.length > 0);
  const branches: Intervention[][] = [
    [forceEvent("ev/maren-return", "b")],
    [negateEvent("ev/maren-return", "b")],
    [setFact(verrinCanon().facts[0]!.subject, verrinCanon().facts[0]!.predicate, "B", "b")],
  ];
  let branchOk = true;
  for (const b of branches) {
    const full = [...base, ...b];
    const flagsFull = foldStateDeltas(verrinCanon(), full).map((d) => d.components.length > 0);
    // base flags must be unchanged by extending a branch
    if (flagsFull.slice(0, base.length).join() !== flagsBase.join()) branchOk = false;
    const retained = full.filter((_, j) => flagsFull[j] === true);
    if (!sameWorld(derive(verrinCanon(), full), derive(verrinCanon(), retained))) branchOk = false;
  }
  console.log(`[BRANCH] isolation+correctness=${branchOk}`);

  const results = { env, rows, branchOk };
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(`\nresults: ${join(OUT, "results.json")}`);
}

main();
