/**
 * Somnium Engine — canon loader + validator unit tests.
 */
import { describe, expect, it } from "vitest";
import { loadCanon, validateCanon } from "./canon";
import { hashState } from "./hash";
import { verrinCanon } from "./verrin";
import type { Canon } from "./types";

describe("loadCanon", () => {
  it("round-trips a valid canon and hashes deterministically", () => {
    const canon = verrinCanon();
    const loaded = loadCanon(JSON.parse(JSON.stringify(canon)));
    expect(loaded.hash).toBe(canon.hash);
    expect(loaded.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(loaded).toEqual(canon);
    // loading the same raw twice yields the same hash
    expect(loadCanon(JSON.parse(JSON.stringify(canon))).hash).toBe(loaded.hash);
  });

  it("recomputes the hash rather than trusting an input hash", () => {
    const canon = verrinCanon();
    const tampered = { ...JSON.parse(JSON.stringify(canon)) as Canon, hash: "deadbeef" };
    expect(loadCanon(tampered).hash).not.toBe("deadbeef");
  });

  it("throws on structurally invalid input", () => {
    const canon = verrinCanon();
    expect(() => loadCanon(null)).toThrow();
    expect(() => loadCanon({ canonId: "canon/x" })).toThrow();
    expect(() => loadCanon({ ...canon, entities: "nope" })).toThrow();
    expect(() => loadCanon({ ...canon, edges: [{ id: "edge/x", kind: "SOMETIMES" }] })).toThrow();
  });

  it("throws on semantically invalid input (duplicate ids)", () => {
    const canon = verrinCanon();
    const duplicated = { ...canon, entities: [...canon.entities, canon.entities[0]] };
    expect(() => loadCanon(duplicated)).toThrow(/invalid canon/);
  });
});

describe("validateCanon", () => {
  it("returns [] for the Verrin canon (baseline contradiction-free)", () => {
    expect(validateCanon(verrinCanon())).toEqual([]);
  });

  it("reports duplicate ids", () => {
    const canon = verrinCanon();
    const broken: Canon = { ...canon, entities: [...canon.entities, canon.entities[0]!] };
    const errors = validateCanon(broken);
    expect(errors.some((e) => /duplicate id/.test(e))).toBe(true);
    expect(errors.some((e) => e.includes("char/vara"))).toBe(true);
  });

  it("reports dangling references", () => {
    const canon = verrinCanon();
    const brokenFact: Canon = { ...canon, facts: [{ ...canon.facts[0]!, subject: "char/ghost" }] };
    expect(validateCanon(brokenFact).some((e) => /subject "char\/ghost"/.test(e))).toBe(true);

    const brokenEdge: Canon = {
      ...canon,
      edges: [...canon.edges, { id: "edge/dangling", kind: "REQUIRES", from: "ev/exodus", to: "ev/ghost" }],
    };
    expect(validateCanon(brokenEdge).some((e) => /ev\/ghost/.test(e))).toBe(true);

    const brokenWork: Canon = {
      ...canon,
      workBindings: [...canon.workBindings, { workId: "work/ghost", events: ["ev/exodus"] }],
    };
    expect(validateCanon(brokenWork).some((e) => /work\/ghost/.test(e))).toBe(true);
  });

  it("reports a REQUIRES cycle with its path", () => {
    const canon = verrinCanon();
    const broken: Canon = {
      ...canon,
      edges: [
        ...canon.edges,
        { id: "edge/loop-a", kind: "REQUIRES", from: "ev/blight-begins", to: "ev/exodus" },
        { id: "edge/loop-b", kind: "REQUIRES", from: "ev/exodus", to: "ev/blight-begins" },
      ],
    };
    const errors = validateCanon(broken);
    const cycle = errors.find((e) => /REQUIRES cycle/.test(e));
    expect(cycle).toBeDefined();
    expect(cycle).toContain("ev/blight-begins");
    expect(cycle).toContain("ev/exodus");
    expect(cycle).toMatch(/->/);
  });

  it("reports a PRECEDES cycle with its path", () => {
    const canon = verrinCanon();
    const broken: Canon = {
      ...canon,
      edges: [
        ...canon.edges,
        { id: "edge/loop-c", kind: "PRECEDES", from: "ev/treaty-of-ash", to: "ev/wardens-arrive" },
      ],
    };
    const errors = validateCanon(broken);
    const cycle = errors.find((e) => /PRECEDES cycle/.test(e));
    expect(cycle).toBeDefined();
    expect(cycle).toContain("ev/wardens-arrive");
    expect(cycle).toContain("ev/treaty-of-ash");
    expect(cycle).toMatch(/->/);
  });
});

describe("hashState", () => {
  it("is key-order independent", () => {
    expect(hashState({ b: 1, a: 2 })).toBe(hashState({ a: 2, b: 1 }));
    expect(hashState({ nested: { y: 1, x: [3, 2, 1] } })).toBe(hashState({ nested: { x: [3, 2, 1], y: 1 } }));
    expect(hashState({ a: 1, b: 2 })).not.toBe(hashState({ a: 2, b: 1 }));
  });
});
