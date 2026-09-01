/**
 * Somnium Engine — world diff unit tests (hand-built WorldStates).
 *
 * P-007: the diff compares the canonical semantic projection. Fixtures here
 * build WorldStates directly, so they carry the P-007 `edges` field; the
 * assertions check the delta shape (FactDelta with windows, ContradictionDelta
 * without lineage, workStatusChanges DELTA, real edgeChanges).
 */
import { describe, expect, it } from "vitest";
import { hashState } from "../canon/hash";
import type { FactView } from "../derive/world-state";
import type { ContradictionRecord } from "./types";
import { worldDiff } from "./diff";
import type { WorldState } from "../derive/world-state";

function fact(id: string, subject: string, predicate: string, object: string | number | boolean | null): FactView {
  return { id, subject, predicate, object, source: "canon", validFrom: null, validTo: null };
}

function makeState(overrides: Partial<WorldState>): WorldState {
  return {
    canonId: "canon/test",
    interventions: [],
    rpId: null,
    judgments: {},
    statuses: {},
    facts: [],
    workStatuses: {},
    contradictions: [],
    temporalViolations: [],
    constraintViolations: [],
    edges: [],
    stateHash: "00000000",
    identityHash: "00000000",
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

  it("reports fact removals sorted by id, carrying content and windows", () => {
    const d = worldDiff(baseline, branch);
    expect(d.factRemovals.map((f) => f.id)).toEqual(["fact/blight", "fact/exodus"]);
    // FactDelta carries the full semantic content — no lineage `source`.
    expect(d.factRemovals[0]).toEqual({
      id: "fact/blight",
      subject: "ev/blight-begins",
      predicate: "cause",
      object: "the-blight",
      validFrom: null,
      validTo: null,
    });
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

  it("reports a validity-window change as its own override field, not as an object change", () => {
    const b = makeState({ statuses: {}, facts: [VARA_VALDAR], workStatuses: {}, contradictions: [] });
    const br = makeState({
      statuses: {},
      facts: [{ ...VARA_VALDAR, validTo: "ev/exodus" }],
      workStatuses: {},
      contradictions: [],
    });
    const d = worldDiff(b, br);
    expect(d.factOverrides).toEqual([
      { factId: "fact/vara-valdar", field: "validTo", from: null, to: "ev/exodus" },
    ]);
  });

  it("reports contradictions introduced and resolved, without lineage source", () => {
    const d = worldDiff(baseline, branch);
    expect(d.contradictionsIntroduced.map((c) => c.id)).toEqual(["contra/1"]);
    expect(d.contradictionsResolved).toEqual([]);
    // ContradictionDelta: semantic content only.
    expect(d.contradictionsIntroduced[0]).toEqual({
      id: "contra/1",
      a: "ev/exodus",
      b: "ev/blight-begins",
      detail: "exodus requires the blight which is negated",
      detectedAt: "ev/exodus",
    });

    const reversed = worldDiff(branch, baseline);
    expect(reversed.contradictionsResolved.map((c) => c.id)).toEqual(["contra/1"]);
    expect(reversed.contradictionsIntroduced).toEqual([]);
  });

  it("reports reachability changes for ESTABLISHED/CONTINGENT statuses", () => {
    const d = worldDiff(baseline, branch);
    expect(d.reachabilityChanges).toContainEqual({ eventId: "ev/exodus", from: true, to: false });
    expect(d.reachabilityChanges).toContainEqual({ eventId: "ev/blight-begins", from: true, to: false });
  });

  it("reports the work-status DELTA, not a branch snapshot", () => {
    const d = worldDiff(baseline, branch);
    expect(d.workStatusChanges).toEqual([
      { workId: "work/verrin-ashfall", from: "PRESERVED", to: "IMPOSSIBLE" },
    ]);
  });

  it("reports edge changes: added and removed edges of the causal law", () => {
    const withEdge = makeState({
      statuses: {},
      facts: [],
      workStatuses: {},
      contradictions: [],
      edges: [{ id: "edge/oath-requires-blight", kind: "REQUIRES", from: "ev/blight-begins", to: "ev/kael-oath" }],
    });
    const withoutEdge = makeState({ statuses: {}, facts: [], workStatuses: {}, contradictions: [] });
    const d = worldDiff(withoutEdge, withEdge);
    expect(d.edgeChanges).toEqual([
      { edgeId: "edge/oath-requires-blight", added: true, kind: "REQUIRES", from: "ev/blight-begins", to: "ev/kael-oath" },
    ]);
    const reversed = worldDiff(withEdge, withoutEdge);
    expect(reversed.edgeChanges).toEqual([
      { edgeId: "edge/oath-requires-blight", added: false, kind: "REQUIRES", from: "ev/blight-begins", to: "ev/kael-oath" },
    ]);
  });

  it("produces a deterministic 8-hex content hash excluding the hash field", () => {
    const d1 = worldDiff(baseline, branch);
    const d2 = worldDiff(baseline, branch);
    expect(d1.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(d1.hash).toBe(d2.hash);
    const { hash: _ignored, ...rest } = d1;
    expect(d1.hash).toBe(hashState(rest));
  });

  it("self-diff is the identity: every delta array empty", () => {
    const d = worldDiff(baseline, baseline);
    expect(d.statusChanges).toEqual([]);
    expect(d.factAdditions).toEqual([]);
    expect(d.factRemovals).toEqual([]);
    expect(d.factOverrides).toEqual([]);
    expect(d.edgeChanges).toEqual([]);
    expect(d.contradictionsIntroduced).toEqual([]);
    expect(d.contradictionsResolved).toEqual([]);
    expect(d.constraintViolationsIntroduced).toEqual([]);
    expect(d.constraintViolationsResolved).toEqual([]);
    expect(d.temporalViolationsIntroduced).toEqual([]);
    expect(d.temporalViolationsResolved).toEqual([]);
    expect(d.reachabilityChanges).toEqual([]);
    expect(d.workStatusChanges).toEqual([]);
  });
});
