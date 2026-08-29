/**
 * Somnium Engine — rewind-point validation unit tests (inline fixtures).
 */
import { describe, expect, it } from "vitest";
import { computeRewindHash, hashCanon } from "../canon/hash";
import type { Canon, CausalEdge, Entity } from "../canon/types";
import { validateRewindPoint } from "./rewind-point";
import type { RewindPoint } from "./types";

const EVENTS: Entity[] = [
  { id: "ev/a", kind: "Event", name: "A" },
  { id: "ev/b", kind: "Event", name: "B" },
  { id: "ev/c", kind: "Event", name: "C" },
];

const PRECEDES_AB: CausalEdge = { id: "edge/ab", kind: "PRECEDES", from: "ev/a", to: "ev/b" };
const PRECEDES_BC: CausalEdge = { id: "edge/bc", kind: "PRECEDES", from: "ev/b", to: "ev/c" };

function makeCanon(): Canon {
  const body = {
    canonId: "canon/test",
    version: "1.0.0",
    entities: EVENTS,
    facts: [],
    edges: [PRECEDES_AB, PRECEDES_BC],
    workBindings: [],
  };
  return { ...body, hash: hashCanon(body) };
}

function makeRewindPoint(canon: Canon, cut: string[], overrides?: Partial<RewindPoint>): RewindPoint {
  const rp: RewindPoint = {
    id: "RP-TEST-001",
    canonId: canon.canonId,
    anchorEvent: "ev/b",
    cut,
    derivedHash: computeRewindHash(canon.canonId, "ev/b", cut, canon.hash),
    label: "test cut",
    tags: [],
    created: "2026-08-30T00:00:00.000Z",
  };
  return { ...rp, ...overrides };
}

describe("validateRewindPoint", () => {
  it("accepts a valid rewind point", () => {
    const canon = makeCanon();
    const rp = makeRewindPoint(canon, ["ev/a", "ev/b"]);
    expect(validateRewindPoint(rp, canon)).toEqual({ ok: true, errors: [] });
  });

  it("accepts an empty cut anchored at the first event", () => {
    const canon = makeCanon();
    const rp = makeRewindPoint(canon, ["ev/a"]);
    expect(validateRewindPoint(rp, canon).ok).toBe(true);
  });

  it("rejects a tampered derivedHash", () => {
    const canon = makeCanon();
    const rp = makeRewindPoint(canon, ["ev/a"], { derivedHash: "deadbeef" });
    const v = validateRewindPoint(rp, canon);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("derivedHash mismatch (tampered)");
  });

  it("rejects a cut that is not downward-closed under PRECEDES", () => {
    const canon = makeCanon();
    // ev/b in the cut but ev/a (its PRECEDES-predecessor) missing.
    const rp = makeRewindPoint(canon, ["ev/b"]);
    const v = validateRewindPoint(rp, canon);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.startsWith("cut not downward-closed"))).toBe(true);
  });

  it("rejects a cut containing unknown event ids", () => {
    const canon = makeCanon();
    const rp = makeRewindPoint(canon, ["ev/a", "ev/ghost"]);
    const v = validateRewindPoint(rp, canon);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("ev/ghost"))).toBe(true);
  });

  it("rejects a rewind point bound to a different canon", () => {
    const canon = makeCanon();
    const rp = makeRewindPoint(canon, ["ev/a"], { canonId: "canon/other" });
    expect(validateRewindPoint(rp, canon).ok).toBe(false);
  });
});
