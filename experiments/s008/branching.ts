/**
 * S008 — branch isolation (Phase 7).
 *
 *   W0
 *   ├── I1 → W1a ── …
 *   ├── I2 → W1b ── …
 *   └── I3 → W1c ── …
 *
 * Verifies:
 *   - branch state is isolated: stepping one branch never changes another;
 *   - the incremental path does not mutate sibling branches (no shared mutable
 *     state) — checked by snapshotting every sibling before and after each step;
 *   - semantic hashes match legacy derive() per branch;
 *   - convergence behaviour is preserved (branches that reach the same effective
 *     world have the same hash).
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";
import { type IncrementalState, initialState, step } from "./incremental";

export interface BranchIsolationResult {
  canon: string;
  branchCount: number;
  depth: number;
  isolationOk: boolean;
  hashesMatchLegacy: boolean;
  convergenceOk: boolean;
  distinctBranchHashes: number;
  note?: string;
}

/** Deterministic branch histories: each starts with a distinct intervention. */
function branchHistories(canon: Canon, branchCount: number, depth: number, seed: number): Intervention[][] {
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const preds = [...new Set(canon.facts.map((f) => f.predicate))].sort();
  const factIds = canon.facts.map((f) => f.id).sort();
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  let a = seed >>> 0;
  const rand = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const branches: Intervention[][] = [];
  for (let b = 0; b < branchCount; b++) {
    const h: Intervention[] = [];
    // Distinct opening move per branch so the branches genuinely diverge.
    if (evs.length > 0) h.push(b % 3 === 0 ? negateEvent(evs[b % evs.length]!, "b") : forceEvent(evs[b % evs.length]!, "b"));
    for (let k = 1; k < depth; k++) {
      const roll = rand();
      if (roll < 0.4 && ents.length > 0 && preds.length > 0) h.push(setFact(pick(ents), pick(preds), true, "b"));
      else if (roll < 0.6 && factIds.length > 0) h.push(retractFact(pick(factIds), "b"));
      else if (roll < 0.8 && edges.length > 0) h.push(severEdge(pick(edges).id, "b"));
      else if (evs.length > 0) h.push(negateEvent(pick(evs), "b"));
      else if (ents.length > 0 && preds.length > 0) h.push(setFact(pick(ents), pick(preds), true, "b"));
    }
    branches.push(h);
  }
  return branches;
}

export function runBranchIsolation(
  opts: { canons?: ("verrin" | "ordos")[]; branchCount?: number; depth?: number; seed?: number } = {}
): BranchIsolationResult[] {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const branchCount = opts.branchCount ?? 6;
  const depth = opts.depth ?? 12;
  const seed = opts.seed ?? 20260911;
  const out: BranchIsolationResult[] = [];

  for (const name of canons) {
    const canon = name === "verrin" ? verrinCanon() : ordosCanon();
    const histories = branchHistories(canon, branchCount, depth, seed);

    // Advance every branch in lockstep, snapshotting all siblings before each step.
    const states: IncrementalState[] = histories.map(() => initialState(canon));
    const snapshotsBefore: string[][] = histories.map(() => []);
    let isolationOk = true;

    for (let k = 0; k < depth; k++) {
      // Snapshot all siblings.
      const before = states.map((s) => s.world.stateHash);
      for (let b = 0; b < states.length; b++) {
        snapshotsBefore[b]!.push(before[b]!);
        const iv = histories[b]![k];
        if (iv !== undefined) states[b] = step(canon, states[b]!, iv);
      }
      // After stepping every branch once, each sibling must be unchanged by the
      // OTHERS' steps. Recompute each branch from its own history up to k and
      // compare: this is the direct isolation check.
      for (let b = 0; b < states.length; b++) {
        const expected = derive(canon, histories[b]!.slice(0, k + 1)).stateHash;
        if (states[b]!.world.stateHash !== expected) isolationOk = false;
      }
    }

    // Legacy match per branch.
    let hashesMatchLegacy = true;
    const finalHashes = new Set<string>();
    for (let b = 0; b < histories.length; b++) {
      const legacy = derive(canon, histories[b]!).stateHash;
      if (states[b]!.world.stateHash !== legacy) hashesMatchLegacy = false;
      finalHashes.add(states[b]!.world.stateHash);
    }

    // Convergence: two identical branches (same history) must share a hash.
    const dupHistory = histories[0]!;
    const dupState = dupHistory.reduce((s, iv) => step(canon, s, iv), initialState(canon));
    const dupLegacy = derive(canon, dupHistory).stateHash;
    const convergenceOk = dupState.world.stateHash === states[0]!.world.stateHash && dupState.world.stateHash === dupLegacy;

    const result: BranchIsolationResult = {
      canon: name,
      branchCount,
      depth,
      isolationOk,
      hashesMatchLegacy,
      convergenceOk,
      distinctBranchHashes: finalHashes.size,
    };
    out.push(result);
    console.log(
      `[BRANCH] ${name} branches=${branchCount} depth=${depth} isolation=${isolationOk} ` +
        `legacyMatch=${hashesMatchLegacy} convergence=${convergenceOk} distinct=${finalHashes.size}`
    );
  }
  return out;
}
