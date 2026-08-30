/**
 * Somnium Engine — query unit tests (hand-built WorldStates).
 */
import { describe, expect, it } from "vitest";
import type { FactView, WorldState } from "../derive/world-state";
import { statusOf, workStatusOf } from "./status";
import { characterFact, reachable } from "./query";

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
    hash: "00000000",
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

describe("characterFact", () => {
  it("returns the matching effective fact or undefined", () => {
    const ws = makeState({
      facts: [view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar")],
    });
    expect(characterFact(ws, "char/vara", "located_in")?.object).toBe("loc/valdar");
    expect(characterFact(ws, "char/vara", "married_to")).toBeUndefined();
  });

  it("prefers the most recently valid fact (latest validFrom)", () => {
    const ws = makeState({
      facts: [
        view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar"),
        view("fact/vara-thornhollow", "char/vara", "located_in", "loc/thornhollow", "ev/exodus"),
      ],
    });
    expect(characterFact(ws, "char/vara", "located_in")?.id).toBe("fact/vara-thornhollow");
  });

  it("falls back to the last effective fact when no validity window is available", () => {
    const ws = makeState({
      facts: [
        view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar"),
        view("fact/vara-thornhollow", "char/vara", "located_in", "loc/thornhollow"),
      ],
    });
    expect(characterFact(ws, "char/vara", "located_in")?.id).toBe("fact/vara-thornhollow");
  });

  it("does not mix characters or predicates", () => {
    const ws = makeState({
      facts: [
        view("fact/vara-valdar", "char/vara", "located_in", "loc/valdar"),
        view("fact/vara-ember", "char/vara", "affiliated_with", "fac/ember"),
        view("fact/kell-valdar", "char/kell", "located_in", "loc/valdar"),
      ],
    });
    expect(characterFact(ws, "char/vara", "affiliated_with")?.object).toBe("fac/ember");
    expect(characterFact(ws, "char/kell", "located_in")?.id).toBe("fact/kell-valdar");
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
