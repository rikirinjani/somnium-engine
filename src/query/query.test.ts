/**
 * Somnium Engine — query unit tests (hand-built WorldStates).
 */
import { describe, expect, it } from "vitest";
import type { FactView, WorldState } from "../derive/world-state";
import { statusOf, workStatusOf } from "./status";
import { characterFact, reachable, subjectFact } from "./query";

function view(id: string, subject: string, predicate: string, object: string | number | boolean | null, validFrom?: string): FactView {
  return {
    id,
    subject,
    predicate,
    object,
    source: "canon",
    ...(validFrom !== undefined ? { validFrom } : {}),
  } as unknown as FactView;
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

describe("statusOf / workStatusOf", () => {
  it("returns the recorded status or UNKNOWN", () => {
    const ws = makeState({
      statuses: { "ev/blight-begins": "ESTABLISHED", "ev/exodus": "UNSUPPORTED" },
      workStatuses: { "work/verrin-ashfall": "IMPOSSIBLE" },
    });
    expect(statusOf(ws, "ev/blight-begins")).toBe("ESTABLISHED");
    expect(statusOf(ws, "ev/exodus")).toBe("UNSUPPORTED");
    expect(statusOf(ws, "ev/never-heard-of")).toBe("UNKNOWN");
    expect(workStatusOf(ws, "work/verrin-ashfall")).toBe("IMPOSSIBLE");
    expect(workStatusOf(ws, "work/never-heard-of")).toBe("UNKNOWN");
  });
});

describe("subjectFact (P-004 rename of characterFact)", () => {
  it("returns the matching effective fact or undefined", () => {
    const ws = makeState({
      facts: [view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar")],
    });
    expect(subjectFact(ws, "char/vara", "located_in")?.object).toBe("loc/valdar");
    expect(subjectFact(ws, "char/vara", "married_to")).toBeUndefined();
  });

  it("works for ANY subject kind — an event, a location, an institution", () => {
    const ws = makeState({
      facts: [
        view("fact/academy-in-valdar", "inst/valdar-academy", "located_in", "loc/valdar"),
        view("fact/blight-cause", "ev/blight-begins", "cause", "the-blight"),
      ],
    });
    expect(subjectFact(ws, "inst/valdar-academy", "located_in")?.object).toBe("loc/valdar");
    expect(subjectFact(ws, "ev/blight-begins", "cause")?.object).toBe("the-blight");
  });

  it("prefers the most recently valid fact (latest validFrom)", () => {
    const ws = makeState({
      facts: [
        view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar"),
        view("fact/vara-thornhollow", "char/vara", "located_in", "loc/thornhollow", "ev/exodus"),
      ],
    });
    expect(subjectFact(ws, "char/vara", "located_in")?.id).toBe("fact/vara-thornhollow");
  });

  it("falls back to the last effective fact when no validity window is available", () => {
    const ws = makeState({
      facts: [
        view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar"),
        view("fact/vara-thornhollow", "char/vara", "located_in", "loc/thornhollow"),
      ],
    });
    expect(subjectFact(ws, "char/vara", "located_in")?.id).toBe("fact/vara-thornhollow");
  });

  it("does not mix subjects or predicates", () => {
    const ws = makeState({
      facts: [
        view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar"),
        view("fact/vara-ember", "char/vara", "affiliated_with", "fac/ember"),
        view("fact/kell-valdar", "char/kell", "located_in", "loc/valdar"),
      ],
    });
    expect(subjectFact(ws, "char/vara", "affiliated_with")?.object).toBe("fac/ember");
    expect(subjectFact(ws, "char/kell", "located_in")?.id).toBe("fact/kell-valdar");
  });

  it("characterFact is a deprecated alias that still delegates to subjectFact", () => {
    const ws = makeState({
      facts: [view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar")],
    });
    expect(characterFact(ws, "char/vara", "located_in")?.object).toBe("loc/valdar");
    expect(characterFact(ws, "char/kell", "located_in")).toBeUndefined();
    // same underlying implementation
    expect(characterFact(ws, "char/vara", "located_in")?.id).toBe(
      subjectFact(ws, "char/vara", "located_in")?.id
    );
  });
});

describe("reachable", () => {
  it("is true for ESTABLISHED and CONTINGENT, false otherwise", () => {
    const ws = makeState({
      statuses: {
        "ev/a": "ESTABLISHED",
        "ev/b": "CONTINGENT",
        "ev/c": "UNSUPPORTED",
        "ev/d": "EXCLUDED",
      },
    });
    expect(reachable(ws, "ev/a")).toBe(true);
    expect(reachable(ws, "ev/b")).toBe(true);
    expect(reachable(ws, "ev/c")).toBe(false);
    expect(reachable(ws, "ev/d")).toBe(false);
    expect(reachable(ws, "ev/missing")).toBe(false);
  });
});
