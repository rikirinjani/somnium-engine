/**
 * Somnium Engine — chain-experiment runner.
 *
 * Multi-depth counterfactual chain experiments (docs/ARCHITECTURE-RECONNAISSANCE.md
 * §11, §16 step 10): one run per depth over the prefixes of an intervention chain.
 *
 * Deterministic by construction (KE's Monte Carlo layer was discarded — §2 item 5):
 * worldHash / diff.hash / depth are pure functions of (canon, chain, rp). The only
 * non-deterministic fields are createdAt / generatedAt (metadata, never hashed).
 *
 * Key semantic split (do not conflate):
 *   - `diff` is against the IMMEDIATE PARENT depth (worldDiff(world[N-1], world[N])).
 *   - `depth.divergence` is measured against the BASELINE world. It is a DISTANCE,
 *     not an accumulator: it does NOT grow monotonically along a chain. An
 *     intervention that restores a canonical value moves the world back toward
 *     baseline and legitimately lowers it (Verrin depths 1-3 score 26 / 25 / 26).
 *     What strictly increases along a chain is genealogicalDepth, never divergence.
 *     See docs/ARCHITECTURE-RECONNAISSANCE.md §8.1(b).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Canon } from "../canon/types";
import type { Intervention, RewindPoint } from "../timeline/types";
import { branchUniverse, createUniverse } from "../timeline/universe";
import { derive } from "../derive/world-state";
import { worldDiff } from "../diff/diff";
import { computeDepth } from "../depth/depth";
import type { ExperimentRun, ExperimentSet } from "./types";

/** Deterministic set id from label + canonHash — no timestamp. */
function computeSetId(label: string, canonHash: string): string {
  const slug = label.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "experiment"}-${canonHash}`;
}

/**
 * Run a multi-depth chain experiment.
 *
 * Produces chain.length + 1 runs:
 *   - depth 0: the baseline world (derive(canon, []) — no rewind point, no
 *     interventions), diff = worldDiff(baseline, baseline).
 *   - depth N (N ≥ 1): full prefix chain.slice(0, N) as interventions, derived
 *     with the rewind point, so depth-N inherits the COMPLETE depth-(N-1) state.
 *     diff is against the immediate parent depth; divergence is against baseline.
 *
 * Universe genealogy mirrors the depths: createUniverse for the baseline, then one
 * branchUniverse per step passing ONLY the new intervention (branchUniverse
 * accumulates the full chain itself).
 */
export function runChain(
  canon: Canon,
  rp: RewindPoint,
  chain: Intervention[],
  label: string
): ExperimentSet {
  const baseline = derive(canon, []);
  const runs: ExperimentRun[] = [];

  // Depth 0: baseline universe + empty diff + zero-depth metrics.
  const baselineUniverse = createUniverse({ canonId: canon.canonId, label: `${label}-d0` });
  runs.push({
    runId: `${label}-d0`,
    canonId: canon.canonId,
    canonHash: canon.hash,
    rpId: null,
    universeId: baselineUniverse.id,
    interventions: [],
    depth: computeDepth(canon, baseline, baseline, [], 0),
    diff: worldDiff(baseline, baseline),
    worldHash: baseline.hash,
    createdAt: new Date().toISOString(),
  });

  let parentUniverse = baselineUniverse;
  let parentWorld = baseline;

  for (let n = 1; n <= chain.length; n += 1) {
    const step = chain[n - 1];
    if (step === undefined) throw new Error(`runChain: intervention at index ${n - 1} is undefined`);
    const prefix = chain.slice(0, n);
    const world = derive(canon, prefix, rp);
    const universe = branchUniverse(parentUniverse, rp, [step], `${label}-d${n}`);

    runs.push({
      runId: `${label}-d${n}`,
      canonId: canon.canonId,
      canonHash: canon.hash,
      rpId: rp.id,
      universeId: universe.id,
      interventions: [...prefix],
      depth: computeDepth(canon, baseline, world, prefix, n),
      diff: worldDiff(parentWorld, world),
      worldHash: world.hash,
      createdAt: new Date().toISOString(),
    });

    parentUniverse = universe;
    parentWorld = world;
  }

  return {
    setId: computeSetId(label, canon.hash),
    label,
    canonId: canon.canonId,
    runs,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Persist an experiment set to `${outDir}/${set.setId}.json` (2-space JSON),
 * creating the directory if needed. Returns the written file path.
 */
export function writeExperimentSet(set: ExperimentSet, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const filePath = join(outDir, `${set.setId}.json`);
  writeFileSync(filePath, `${JSON.stringify(set, null, 2)}\n`, "utf8");
  return filePath;
}
