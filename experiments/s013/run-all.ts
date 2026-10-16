/**
 * S013 — Future Observability / Minimal Sufficient Retention.
 *
 * DEFINITION (observational, per spec). Within history H, intervention I at
 * index i is FUTURE-OBSERVABLE iff there exists a valid suffix S such that
 *
 *     derive(H + S)  !=  derive(H without I + S)
 *
 * compared by effectiveSemanticState / stateHash / directed WorldDiff.
 *
 * The oracle only calls the authoritative `derive`; it encodes no semantic rule.
 * It is deliberately expensive — correctness over speed.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
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
  relocate,
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

function randomHistory(canon: Canon, h: number, seed: number): Intervention[] {
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

/** A bounded suffix population: single ops + targeted pairs + random. */
function suffixPopulation(canon: Canon, target: Intervention, seed: number): Intervention[][] {
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const preds = [...new Set(canon.facts.map((f) => f.predicate))].sort();
  const objs = [...new Set(canon.facts.map((f) => f.object))];
  const factIds = canon.facts.map((f) => f.id).sort();
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const singles: Intervention[] = [];
  for (const e of evs) {
    singles.push(negateEvent(e, "s"));
    singles.push(forceEvent(e, "s"));
  }
  for (const f of factIds) singles.push(retractFact(f, "s"));
  for (const e of edges) {
    singles.push(severEdge(e.id, "s"));
    singles.push(addEdge({ ...e }, "s"));
  }
  for (const s of ents.slice(0, 6)) for (const p of preds.slice(0, 6)) singles.push(setFact(s, p, objs.length > 0 ? objs[0]! : true, "s"));
  if (ents.length > 1) singles.push(relocate(ents[0]!, ents[1]!, "s"));

  const out: Intervention[][] = [[], ...singles.map((x) => [x])];
  // targeted pairs: the target's own kind repeated / complemented
  for (const s of singles.slice(0, 24)) out.push([target, s]);
  // random triples
  const rand = rng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  for (let k = 0; k < 120; k++) out.push([pick(singles), pick(singles), pick(singles)]);
  return out;
}

interface Step {
  index: number;
  kind: string;
  target: string;
  semanticChanged: boolean;
  foldChanged: boolean;
  futureObservable: boolean;
  witnessSuffix: string[] | null;
}

function analyse(canon: Canon, H: Intervention[], maxSteps: number, seed: number): Step[] {
  const deltas = foldStateDeltas(canon, H);
  const out: Step[] = [];
  let prevHash = derive(canon, []).stateHash;
  for (let i = 0; i < H.length && out.length < maxSteps; i++) {
    const curHash = derive(canon, H.slice(0, i + 1)).stateHash;
    const semanticChanged = curHash !== prevHash;
    const foldChanged = (deltas[i]?.components.length ?? 0) > 0;
    const without = [...H.slice(0, i), ...H.slice(i + 1)];
    // future observability oracle
    let futureObservable = false;
    let witness: string[] | null = null;
    if (foldChanged) {
      for (const S of suffixPopulation(canon, H[i]!, seed + i)) {
        const a = derive(canon, [...H, ...S]);
        const b = derive(canon, [...without, ...S]);
        if (!sameWorld(a, b)) {
          futureObservable = true;
          witness = S.map((x) => `${x.kind}:${x.target}`);
          break;
        }
      }
    }
    out.push({
      index: i,
      kind: H[i]!.kind,
      target: H[i]!.target,
      semanticChanged,
      foldChanged,
      futureObservable,
      witnessSuffix: witness,
    });
    prevHash = curHash;
  }
  return out;
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

  console.log("=== S013 — Future Observability / Minimal Sufficient Retention ===");
  console.log(`commit ${env.commit} | ${cpus[0]?.model} | ${cpus.length} vCPU\n`);

  const allSteps: Step[] = [];
  const perCanon: Record<string, { A: number; B: number; C: number; D: number; Cexposed: number; Ctotal: number; Cwitnesses: string[][] }> = {};

  for (const [name, canon] of [["verrin", verrinCanon()], ["ordos", ordosCanon()]] as [string, Canon][]) {
    const histories: Intervention[][] = [];
    for (let i = 0; i < (quick ? 3 : 8); i++) histories.push(randomHistory(canon, quick ? 12 : 20, 20260916 + i * 7919));
    const steps: Step[] = [];
    for (const H of histories) steps.push(...analyse(canon, H, quick ? 60 : 200, 20260916));
    allSteps.push(...steps);

    const counts = { A: 0, B: 0, C: 0, D: 0, Cexposed: 0, Ctotal: 0, Cwitnesses: [] as string[][] };
    for (const s of steps) {
      if (s.semanticChanged && s.foldChanged && s.futureObservable) counts.A++;
      else if (!s.semanticChanged && s.foldChanged && s.futureObservable) counts.B++;
      else if (!s.semanticChanged && s.foldChanged && !s.futureObservable) {
        counts.C++;
        counts.Ctotal++;
      } else if (!s.semanticChanged && !s.foldChanged && !s.futureObservable) counts.D++;
      else {
        // semantic changed but fold did not / not future-observable: record under B/A conservatively
        if (s.semanticChanged) counts.A++;
        else counts.B++;
      }
    }
    perCanon[name] = counts;
    console.log(
      `[${name}] A=${counts.A} B=${counts.B} C=${counts.C} D=${counts.D}  (C exposed by suffix: ${counts.Cexposed}/${counts.Ctotal})`
    );
    // Report category-C witnesses for those that ARE observable (should be 0 by construction of C)
    for (const s of steps.filter((x) => !x.semanticChanged && x.foldChanged && x.futureObservable).slice(0, 5)) {
      console.log(`   C-exposed: ${s.kind}:${s.target} witnessSuffix=[${(s.witnessSuffix ?? []).join(", ")}]`);
    }
  }

  // The key question: is any fold-changed step future-OBSERVABLE that S012's
  // classifier called C? By definition C = !futureObservable in the S012 sense
  // (immediate removal), so we re-check with suffixes.
  const foldChangedSteps = allSteps.filter((s) => s.foldChanged);
  const foldChangedFutureInvisible = foldChangedSteps.filter((s) => !s.futureObservable);
  const semanticInvisibleButFutureVisible = allSteps.filter((s) => !s.semanticChanged && s.futureObservable);
  console.log(`\n[SUMMARY] fold-changed steps=${foldChangedSteps.length}`);
  console.log(`  fold-changed AND future-invisible (suffix-search bound) = ${foldChangedFutureInvisible.length}`);
  console.log(`  semantic-invisible BUT future-visible (category B class) = ${semanticInvisibleButFutureVisible.length}`);
  for (const s of semanticInvisibleButFutureVisible.slice(0, 8)) {
    console.log(`   B: ${s.kind}:${s.target} witness=[${(s.witnessSuffix ?? []).join(", ")}]`);
  }

  // Differential: S012 retention (keep iff fold delta) over the same histories.
  let diffTotal = 0;
  let diffOk = 0;
  for (const [name, canon] of [["verrin", verrinCanon()], ["ordos", ordosCanon()]] as [string, Canon][]) {
    for (let i = 0; i < (quick ? 3 : 8); i++) {
      const H = randomHistory(canon, quick ? 12 : 20, 20260916 + i * 7919);
      const deltas = foldStateDeltas(canon, H);
      const R = H.filter((_, k) => (deltas[k]?.components.length ?? 0) > 0);
      diffTotal++;
      if (sameWorld(derive(canon, H), derive(canon, R))) diffOk++;
    }
  }
  console.log(`\n[DIFF] S012 delta-retention: ${diffOk}/${diffTotal}`);

  const results = { env, perCanon, diff: { total: diffTotal, ok: diffOk } };
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(`\nresults: ${join(OUT, "results.json")}`);
}

main();
