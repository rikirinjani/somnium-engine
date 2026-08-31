/**
 * Somnium Engine — chain-experiment runner unit tests.
 *
 * Verifies the runner lane against the executable contract in
 * tests/acceptance/depth-acceptance.test.ts (describe("chain experiments..."))
 * plus the persistence helper. No statistical layer: the engine is deterministic.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verrinCanon, verrinRewindPoint } from "../canon/verrin";
import { derive } from "../derive/world-state";
import { worldDiff } from "../diff/diff";
import { negateEvent, relocate, setFact } from "../timeline/types";
import type { ExperimentSet } from "./types";
import { runChain, writeExperimentSet } from "./runner";

const canon = verrinCanon();
const rp = verrinRewindPoint();

const CHAIN = [
  negateEvent("ev/blight-begins"), // depth 1: the cataclysm never happens
  setFact("char/vara", "located_in", "loc/thornhollow"), // depth 2: she goes anyway
  relocate("char/vara", "loc/stonehall"), // depth 3: and then moves on
];
const LABEL = "runner-test-chain";
const BASELINE = derive(canon, []);

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runChain: structure", () => {
  it("produces one run per depth, in order, with the baseline as depth 0", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);

    expect(set.runs).toHaveLength(CHAIN.length + 1); // 3 interventions + baseline
    expect(set.runs.map((r) => r.depth.genealogicalDepth)).toEqual([0, 1, 2, 3]);
    expect(set.runs.map((r) => r.depth.interventionCount)).toEqual([0, 1, 2, 3]);
  });

  it("depth 0 is the un-rewound baseline with an empty diff", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);
    const d0 = set.runs[0]!;

    expect(d0.interventions).toEqual([]);
    expect(d0.rpId).toBeNull();
    expect(d0.worldHash).toBe(BASELINE.identityHash);
    expect(d0.diff.hash).toBe(worldDiff(BASELINE, BASELINE).hash);
    expect(d0.diff.statusChanges).toEqual([]);
    expect(d0.diff.factAdditions).toEqual([]);
    expect(d0.diff.factRemovals).toEqual([]);
  });

  it("each depth carries the FULL intervention chain from baseline", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);
    expect(set.runs[0]?.interventions).toEqual([]);
    expect(set.runs[1]?.interventions.map((i) => i.id)).toEqual([CHAIN[0]!.id]);
    expect(set.runs[2]?.interventions.map((i) => i.id)).toEqual([CHAIN[0]!.id, CHAIN[1]!.id]);
    expect(set.runs[3]?.interventions.map((i) => i.id)).toEqual([CHAIN[0]!.id, CHAIN[1]!.id, CHAIN[2]!.id]);
  });

  it("anchors runs to the canon and the rewind point", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);

    expect(set.canonId).toBe(canon.canonId);
    for (const run of set.runs) {
      expect(run.canonId).toBe(canon.canonId);
      expect(run.canonHash).toBe(canon.hash);
    }
    expect(set.runs[0]?.rpId).toBeNull();
    for (const run of set.runs.slice(1)) {
      expect(run.rpId).toBe(rp.id);
    }
  });

  it("builds a real universe genealogy (baseline + one branch per depth)", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);
    const ids = set.runs.map((r) => r.universeId);

    expect(new Set(ids).size).toBe(ids.length); // all distinct
    for (const id of ids) {
      expect(id).toMatch(/^U-(BASELINE|\d{3})$/);
    }
  });
});

describe("runChain: semantics", () => {
  it("depth N worldHash equals a direct derive of the full prefix", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);

    for (let n = 0; n <= CHAIN.length; n += 1) {
      const prefix = CHAIN.slice(0, n);
      const direct = n === 0 ? derive(canon, []) : derive(canon, prefix, rp);
      expect(set.runs[n]?.worldHash).toBe(direct.identityHash);
    }
  });

  it("diff is against the IMMEDIATE parent depth, not the baseline", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);

    for (let n = 1; n <= CHAIN.length; n += 1) {
      const parent = derive(canon, CHAIN.slice(0, n - 1), rp);
      const child = derive(canon, CHAIN.slice(0, n), rp);
      expect(set.runs[n]?.diff.hash).toBe(worldDiff(parent, child).hash);
    }
    // depth 0's diff is the empty baseline-vs-baseline diff
    expect(set.runs[0]?.diff.hash).toBe(worldDiff(BASELINE, BASELINE).hash);
  });

  it("divergence is measured against the baseline while diff stays parent-relative", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);
    const scores = set.runs.map((r) => r.depth.divergence.score);

    expect(scores[0]).toBe(0);
    expect(scores[1]!).toBeGreaterThan(0);
    expect(scores[2]!).toBeGreaterThan(0);
    expect(scores[3]!).toBeGreaterThan(0);
    // divergence is a DISTANCE from baseline, not a monotone accumulator: the
    // depth-2 intervention restores Vara's canonical location, so the score
    // legitimately DROPS (26 -> 25); depth 3 moves her away again (26). What
    // strictly increases along the chain is genealogical depth, not divergence.
    expect(scores[2]!).toBeLessThan(scores[1]!);
    expect(scores[3]!).toBeGreaterThan(scores[2]!);

    // depth-2 diff is only the delta d1 -> d2, which must NOT equal the d0 -> d2 delta
    const d0toD2 = worldDiff(BASELINE, derive(canon, CHAIN.slice(0, 2), rp));
    expect(set.runs[2]?.diff.hash).not.toBe(d0toD2.hash);
  });
});

describe("runChain: determinism", () => {
  it("runIds and setId are deterministic and carry no timestamps", () => {
    const a = runChain(canon, rp, CHAIN, LABEL);
    const b = runChain(canon, rp, CHAIN, LABEL);

    expect(a.setId).toBe(b.setId);
    expect(a.setId).toMatch(/^runner-test-chain-[0-9a-f]{8}$/);
    expect(a.setId).not.toMatch(/\d{4}-\d{2}-\d{2}T/);

    a.runs.forEach((run, n) => {
      expect(run.runId).toBe(`${LABEL}-d${n}`);
      expect(run.runId).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
    expect(a.runs.map((r) => r.runId)).toEqual(b.runs.map((r) => r.runId));
  });

  it("two runs with identical inputs are identical in every hashed field", () => {
    const a = runChain(canon, rp, CHAIN, LABEL);
    const b = runChain(canon, rp, CHAIN, LABEL);

    expect(a.runs.map((r) => r.worldHash)).toEqual(b.runs.map((r) => r.worldHash));
    expect(a.runs.map((r) => r.diff.hash)).toEqual(b.runs.map((r) => r.diff.hash));
    expect(a.runs.map((r) => r.depth)).toEqual(b.runs.map((r) => r.depth));
    expect(a.runs.map((r) => r.interventions)).toEqual(b.runs.map((r) => r.interventions));
  });

  it("carries no statistical layer (deterministic engine: no replicates, no CI)", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);
    for (const run of set.runs) {
      const asRecord = run as unknown as Record<string, unknown>;
      expect(asRecord["seed"]).toBeUndefined();
      expect(asRecord["replicates"]).toBeUndefined();
      expect(asRecord["ci95"]).toBeUndefined();
      expect(asRecord["cohensD"]).toBeUndefined();
    }
  });
});

describe("writeExperimentSet", () => {
  it("round-trips a set through JSON on disk", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);
    const outDir = mkdtempSync(join(tmpdir(), "somnium-exp-"));
    tempDirs.push(outDir);

    const filePath = writeExperimentSet(set, outDir);
    expect(filePath.endsWith(`${set.setId}.json`)).toBe(true);

    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as ExperimentSet;

    expect(parsed).toEqual(set);
    expect(raw.startsWith("{\n  \"setId\":")).toBe(true); // 2-space indented
    tempDirs.splice(tempDirs.indexOf(outDir), 1);
    rmSync(outDir, { recursive: true, force: true });
  });

  it("creates the directory if needed", () => {
    const set = runChain(canon, rp, CHAIN, LABEL);
    const outDir = join(tmpdir(), "somnium-exp-nested", "deep");
    tempDirs.push(outDir);

    const filePath = writeExperimentSet(set, outDir);
    expect(readFileSync(filePath, "utf8").length).toBeGreaterThan(0);
  });
});
