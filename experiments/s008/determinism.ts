/**
 * S008 — determinism (Phase 8).
 *
 * Repeated identical inputs must produce the same semantic state, the same
 * stateHash and the same WorldDiff. Both the legacy and the incremental path are
 * exercised, and the two are cross-checked, over repeated trials.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
import { incrementalDerive } from "./incremental";
import { isEmptyDiff } from "./equivalence";
import { linearHistory } from "./performance";

export interface DeterminismResult {
  canon: string;
  trials: number;
  horizon: number;
  legacyStable: boolean;
  incrementalStable: boolean;
  crossEqual: boolean;
  diffEmpty: boolean;
  sampleHash: string;
  note?: string;
}

export function runDeterminism(
  opts: { canons?: ("verrin" | "ordos")[]; trials?: number; horizon?: number; seed?: number } = {}
): DeterminismResult[] {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const trials = opts.trials ?? 5;
  const horizon = opts.horizon ?? 200;
  const seed = opts.seed ?? 20260911;
  const out: DeterminismResult[] = [];

  for (const name of canons) {
    const canon = name === "verrin" ? verrinCanon() : ordosCanon();
    const history = linearHistory(canon, horizon, seed);

    const legacyHashes = new Set<string>();
    const incHashes = new Set<string>();
    const legacyReprs = new Set<string>();
    const incReprs = new Set<string>();
    let diffEmpty = true;

    let firstLegacy: ReturnType<typeof derive> | null = null;
    let firstInc: ReturnType<typeof derive> | null = null;

    for (let t = 0; t < trials; t++) {
      const legacy = derive(canon, history);
      const inc = incrementalDerive(canon, history);
      legacyHashes.add(legacy.stateHash);
      incHashes.add(inc.stateHash);
      legacyReprs.add(canonicalJson(effectiveSemanticState(legacy)));
      incReprs.add(canonicalJson(effectiveSemanticState(inc)));
      if (!isEmptyDiff(worldDiff(legacy, inc))) diffEmpty = false;
      firstLegacy ??= legacy;
      firstInc ??= inc;
    }

    const result: DeterminismResult = {
      canon: name,
      trials,
      horizon,
      legacyStable: legacyHashes.size === 1 && legacyReprs.size === 1,
      incrementalStable: incHashes.size === 1 && incReprs.size === 1,
      crossEqual: firstLegacy !== null && firstInc !== null && firstLegacy.stateHash === firstInc.stateHash,
      diffEmpty,
      sampleHash: firstLegacy?.stateHash ?? "",
    };
    out.push(result);
    console.log(
      `[DET] ${name} trials=${trials} H=${horizon} legacyStable=${result.legacyStable} ` +
        `incStable=${result.incrementalStable} crossEqual=${result.crossEqual} diffEmpty=${result.diffEmpty}`
    );
  }
  return out;
}
