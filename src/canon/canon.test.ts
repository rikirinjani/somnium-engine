/**
 * Somnium Engine — canon loader + validator unit tests.
 */
import { describe, expect, it } from "vitest";
import { inspectCanon, loadCanon, validateCanon } from "./canon";
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

  it("accepts an Object-kind entity (P-004: artifacts/relics/regalia)", () => {
    const canon = verrinCanon();
    const withSeal: Canon = {
      ...canon,
      entities: [...canon.entities, { id: "obj/seal-of-office", kind: "Object", name: "The Seal" }],
      facts: [...canon.facts, { id: "fact/seal-silver", subject: "obj/seal-of-office", predicate: "material", object: "silver", validFrom: null, validTo: null, source: "canon" }],
    };
    const loaded = loadCanon(JSON.parse(JSON.stringify(withSeal)));
    expect(loaded.entities.some((e) => e.id === "obj/seal-of-office" && e.kind === "Object")).toBe(true);
    expect(validateCanon(withSeal)).toEqual([]);
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

  // P-004 CHANGE (these two were `errors`, now `notices`). P-003 made both
  // cycle kinds first-class ENGINE BEHAVIOURS, not corruption:
  //   REQUIRES cycle -> an unfounded set, rejected as UNSUPPORTED by
  //                     well-founded semantics unless a group reaches outside it
  //   PRECEDES cycle -> a temporalViolation when it occurs among occurring
  //                     events, while the events themselves stay ESTABLISHED
  // Calling them fatal meant the validator still believed Verrin's shape
  // (complete and acyclic) while the engine had moved on. The proof it was
  // wrong: P-003's own adversarial fixture derives a perfectly usable world and
  // yet `validateCanon` called it invalid on seven counts — nothing caught that
  // because nothing ever validated that canon.
  it("reports a REQUIRES cycle as a NOTICE, not an error", () => {
    const canon = verrinCanon();
    const broken: Canon = {
      ...canon,
      edges: [
        ...canon.edges,
        { id: "edge/loop-a", kind: "REQUIRES", from: "ev/blight-begins", to: "ev/exodus" },
        { id: "edge/loop-b", kind: "REQUIRES", from: "ev/exodus", to: "ev/blight-begins" },
      ],
    };
    const { errors, notices } = inspectCanon(broken);
    const cycle = notices.find((e) => /REQUIRES cycle/.test(e));
    expect(cycle).toBeDefined();
    expect(cycle).toContain("ev/blight-begins");
    expect(cycle).toContain("ev/exodus");
    expect(cycle).toMatch(/->/);
    // and it is NOT fatal
    expect(errors.some((e) => /REQUIRES cycle/.test(e))).toBe(false);
    expect(validateCanon(broken)).toEqual([]);
  });

  it("reports a PRECEDES cycle as a NOTICE, not an error", () => {
    const canon = verrinCanon();
    const broken: Canon = {
      ...canon,
      edges: [
        ...canon.edges,
        { id: "edge/loop-c", kind: "PRECEDES", from: "ev/treaty-of-ash", to: "ev/wardens-arrive" },
      ],
    };
    const { errors, notices } = inspectCanon(broken);
    const cycle = notices.find((e) => /PRECEDES cycle/.test(e));
    expect(cycle).toBeDefined();
    expect(cycle).toContain("ev/wardens-arrive");
    expect(cycle).toContain("ev/treaty-of-ash");
    expect(cycle).toMatch(/->/);
    expect(errors.some((e) => /PRECEDES cycle/.test(e))).toBe(false);
    expect(validateCanon(broken)).toEqual([]);
  });

  it("treats an UNDECLARED dangling reference as an error but a DECLARED one as a notice", () => {
    // A deliberate unknown and a typo are structurally identical — a reference
    // to an id that does not exist. The canon must state which it means, which
    // is exactly what `Canon.unspecified` is for.
    const canon = verrinCanon();
    const dangling: Canon = {
      ...canon,
      edges: [
        ...canon.edges,
        { id: "edge/mystery", kind: "REQUIRES", from: "ev/never-declared", to: "ev/exodus" },
      ],
    };
    expect(validateCanon(dangling).some((e) => /ev\/never-declared/.test(e))).toBe(true);

    const declared: Canon = { ...dangling, unspecified: ["ev/never-declared"] };
    const inspected = inspectCanon(declared);
    expect(inspected.errors).toEqual([]);
    expect(inspected.notices.some((n) => /ev\/never-declared/.test(n))).toBe(true);
  });

  it("rejects an id that is both declared and listed as unspecified", () => {
    const canon = verrinCanon();
    const contradictory: Canon = { ...canon, unspecified: ["ev/exodus"] };
    expect(
      validateCanon(contradictory).some((e) => /cannot be both/.test(e))
    ).toBe(true);
  });

  it("reports an entity-valued fact object that is not a known id (typo guard)", () => {
    const canon = verrinCanon();
    const broken: Canon = {
      ...canon,
      facts: [{ ...canon.facts[0]!, object: "loc/valdarr" }], // typo: two r's
    };
    const errors = validateCanon(broken);
    const hit = errors.find((e) => /looks like an id reference/.test(e));
    expect(hit).toBeDefined();
    expect(hit).toContain('"loc/valdarr"');
  });

  it("does NOT flag literal objects without a slash, or known ids", () => {
    const canon = verrinCanon();
    // "ash" is a literal (no slash); the other objects are known entity ids.
    expect(validateCanon(canon)).toEqual([]);
  });

  it("reports work.facts entries that do not resolve to known facts", () => {
    const canon = verrinCanon();
    const broken: Canon = {
      ...canon,
      workBindings: [
        { ...canon.workBindings[0]!, facts: ["fact/no-such-fact"] },
        ...canon.workBindings.slice(1),
      ],
    };
    const errors = validateCanon(broken);
    expect(errors.some((e) => e.includes('fact "fact/no-such-fact" is not a known fact'))).toBe(true);
  });

  it("round-trips a work.facts requirement through loadCanon (absent key stays absent)", () => {
    const canon = verrinCanon();
    const withFacts: Canon = {
      ...canon,
      workBindings: [
        { ...canon.workBindings[0]!, facts: ["fact/vara-in-thornhollow"] },
        ...canon.workBindings.slice(1),
      ],
    };
    const loaded = loadCanon(JSON.parse(JSON.stringify(withFacts)));
    const wb = loaded.workBindings.find((w) => w.workId === "work/verrin-ashfall");
    expect(wb?.facts).toEqual(["fact/vara-in-thornhollow"]);
    // a binding without `facts` never gains the key (content-hash stable)
    expect("facts" in canon.workBindings[0]!).toBe(false);
  });
});

describe("hashState", () => {
  it("is key-order independent", () => {
    expect(hashState({ b: 1, a: 2 })).toBe(hashState({ a: 2, b: 1 }));
    expect(hashState({ nested: { y: 1, x: [3, 2, 1] } })).toBe(hashState({ nested: { x: [3, 2, 1], y: 1 } }));
    expect(hashState({ a: 1, b: 2 })).not.toBe(hashState({ a: 2, b: 1 }));
  });
});
