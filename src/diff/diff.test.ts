/**
 * Somnium Engine — world diff unit tests (hand-built WorldStates).
 */
import { describe, expect, it } from "vitest";
import { hashState } from "../canon/hash";
import type { Fact } from "../canon/types";
import type { ContradictionRecord } from "./types";
import { worldDiff } from "./diff";
import type { WorldState } from "../derive/world-state";

function fact(id: string, subject: string, predicate: string, object: string | number | boolean | null): Fact {
  return { id, subject, predicate, object, validFrom: null, validTo: null, source: "canon" };
}

function makeState(overrides: Partial<WorldState>): WorldState {
  return {
    canonId: "canon/test",
    interventions: [],
    rpId: null,
    statuses: {},
    facts: [],
    workStatuses: {},
    contradictions: [],
    hash: "00000000",
    ...overrides,
  };
}

const BLIGHT = fact("fact/blight", "ev/blight-begins", "cause", "the-blight");
const EXODUS = fact("fact/exodus", "ev/exodus", "cause", "the-exodus");
const VARA_VALDAR = fact("fact/vara-valdar", "char/vara", "located_in", "loc/valdar");
const CONTRA: ContradictionRecord = {
  id: "contra/1",
  a: "ev/exodus",
  b: "ev/blight-begins",
  detail: "exodus requires the blight which is negated",
  source: "intervention",
  detectedAt: "ev/exodus",
};

const baseline = makeState({
  statuses: { "ev/blight-begins": "ESTABLISHED", "ev/exodus": "ESTABLISHED" },
  facts: [BLIGHT, EXODUS, VARA_VALDAR],
  workStatuses: { "work/verrin-ashfall": "PRESERVED" },
  contradictions: [],
});

const branch = makeState({
  statuses: { "ev/blight-begins": "EXCLUDED", "ev/exodus": "UNSUPPORTED" },
  facts: [VARA_VALDAR], // blight/exodus-established facts vanish
  workStatuses: { "work/verrin-ashfall": "IMPOSSIBLE" },
  contradictions: [CONTRA],
});

describe("worldDiff", () => {
  it("emits structural status changes", () => {
    const d = worldDiff(baseline, branch);
    expect(d.statusChanges).toContainEqual({ entityId: "ev/blight-begins", from: "ESTABLISHED", to: "EXCLUDED" });
    expect(d.statusChanges).toContainEqual({ entityId: "ev/exodus", from: "ESTABLISHED", to: "UNSUPPORTED" });
  });

  it("reports fact removals sorted by id", () => {
    const d = worldDiff(baseline, branch);
    expect(d.factRemovals.map((f) => f.id)).toEqual(["fact/blight", "fact/exodus"]);
  });

  it("reports fact additions sorted by id", () => {
    const added = fact("fact/new-dawn", "ev/dawn", "cause", "the-dawn");
    const d = worldDiff(baseline, makeState({ statuses: {}, facts: [BLIGHT, EXODUS, VARA_VALDAR, added] }));
    expect(d.factAdditions.map((f) => f.id)).toEqual(["fact/new-dawn"]);
  });

  it("reports fact overrides for facts present in both worlds with different objects", () => {
    const b = makeState({ statuses: {}, facts: [VARA_VALDAR], workStatuses: {}, contradictions: [] });
    const br = makeState({
      statuses: {},
      facts: [{ ...VARA_VALDAR, object: "loc/thornhollow" }],
      workStatuses: {},
      contradictions: [],
    });
    const d = worldDiff(b, br);
    expect(d.factOverrides).toEqual([
      { factId: "fact/vara-valdar", field: "object", from: "loc/valdar", to: "loc/thornhollow" },
    ]);
  });

  it("reports contradictions introduced and resolved", () => {
    const d = worldDiff(baseline, branch);
    expect(d.contradictionsIntroduced.map((c) => c.id)).toEqual(["contra/1"]);
    expect(d.contradictionsResolved).toEqual([]);

    const reversed = worldDiff(branch, baseline);
    expect(reversed.contradictionsResolved.map((c) => c.id)).toEqual(["contra/1"]);
    expect(reversed.contradictionsIntroduced).toEqual([]);
  });

  it("reports reachability changes for ESTABLISHED/CONTINGENT statuses", () => {
    const d = worldDiff(baseline, branch);
    expect(d.reachabilityChanges).toContainEqual({ eventId: "ev/exodus", from: true, to: false });
    expect(d.reachabilityChanges).toContainEqual({ eventId: "ev/blight-begins", from: true, to: false });
  });

  it("carries the branch work statuses", () => {
    const d = worldDiff(baseline, branch);
    expect(d.workStatuses["work/verrin-ashfall"]).toBe("IMPOSSIBLE");
  });

  it("reserves edgeChanges as empty in v1", () => {
    expect(worldDiff(baseline, branch).edgeChanges).toEqual([]);
  });

  it("produces a deterministic 8-hex content hash excluding the hash field", () => {
    const d1 = worldDiff(baseline, branch);
    const d2 = worldDiff(baseline, branch);
    expect(d1.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(d1.hash).toBe(d2.hash);
    const { hash: _ignored, ...rest } = d1;
    expect(d1.hash).toBe(hashState(rest));
  });
});
