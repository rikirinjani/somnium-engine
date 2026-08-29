/**
 * Somnium Engine — Verrin seed library unit tests.
 *
 * These assert the structure the acceptance suite depends on: exact event ids,
 * the critical Vara location facts, the REQUIRES skeleton, work bindings, the
 * Rewind Point hash, and baseline soundness.
 */
import { describe, expect, it } from "vitest";
import { verrinCanon, verrinRewindPoint } from "./verrin";
import { computeRewindHash, hashCanon } from "./hash";
import { validateCanon } from "./canon";

// REQUIRES pairs in engine convention (types.ts): from=prerequisite, to=dependent.
// "ev/exodus REQUIRES ev/blight-begins" => ["ev/blight-begins", "ev/exodus"].
const REQUIRED_REQUIRES: Array<[string, string]> = [
  ["ev/blight-begins", "ev/exodus"],
  ["ev/exodus", "ev/ashfall-falls"],
  ["ev/blight-begins", "ev/ember-ultimatum"],
  ["ev/ember-ultimatum", "ev/orin-defies"],
  ["ev/blight-begins", "ev/vara-vow"],
  ["ev/kael-oath", "ev/wardens-arrive"],
  ["ev/wardens-arrive", "ev/treaty-of-ash"],
  ["ev/treaty-of-ash", "ev/valdar-rebuilds"],
];

const REQUIRED_EVENTS = [
  "ev/blight-begins",
  "ev/exodus",
  "ev/ashfall-falls",
  "ev/ember-ultimatum",
  "ev/orin-defies",
  "ev/wardens-arrive",
  "ev/valdar-besieged",
  "ev/treaty-of-ash",
  "ev/vara-vow",
  "ev/kael-oath",
  "ev/maren-return",
  "ev/valdar-rebuilds",
];

describe("verrinCanon", () => {
  it("has the required identity and version", () => {
    const canon = verrinCanon();
    expect(canon.canonId).toBe("canon/verrin");
    expect(canon.version).toBe("1.0.0");
  });

  it("is structurally complete", () => {
    const canon = verrinCanon();
    expect(canon.entities.length).toBeGreaterThanOrEqual(12);
    expect(canon.facts.length).toBeGreaterThan(0);
    expect(canon.edges.length).toBeGreaterThan(0);
    expect(canon.workBindings.length).toBeGreaterThanOrEqual(1);

    const kinds = new Set(canon.entities.map((e) => e.kind));
    for (const kind of ["Character", "Location", "Faction", "Institution", "Event", "Work"]) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });

  it("contains every event id the acceptance contract references", () => {
    const canon = verrinCanon();
    const eventIds = new Set(canon.entities.filter((e) => e.kind === "Event").map((e) => e.id));
    for (const id of REQUIRED_EVENTS) {
      expect(eventIds.has(id)).toBe(true);
    }
  });

  it("ships the critical Vara location facts (baseline vs branch)", () => {
    const canon = verrinCanon();
    const inValdar = canon.facts.find((f) => f.id === "fact/vara-in-valdar");
    expect(inValdar).toMatchObject({
      subject: "char/vara",
      predicate: "located_in",
      object: "loc/valdar",
      validFrom: null,
      validTo: "ev/exodus",
    });
    const inThornhollow = canon.facts.find((f) => f.id === "fact/vara-in-thornhollow");
    expect(inThornhollow).toMatchObject({
      subject: "char/vara",
      predicate: "located_in",
      object: "loc/thornhollow",
      validFrom: "ev/exodus",
      validTo: null,
    });
  });

  it("ships every REQUIRES pair required by the acceptance contract", () => {
    const canon = verrinCanon();
    for (const [from, to] of REQUIRED_REQUIRES) {
      expect(
        canon.edges.some((e) => e.kind === "REQUIRES" && e.from === from && e.to === to)
      ).toBe(true);
    }
  });

  it("binds the works to the events the acceptance contract depends on", () => {
    const canon = verrinCanon();
    const ashfall = canon.workBindings.find((w) => w.workId === "work/verrin-ashfall");
    expect(ashfall?.events).toEqual(["ev/blight-begins", "ev/exodus", "ev/ashfall-falls"]);
    const prelude = canon.workBindings.find((w) => w.workId === "work/ember-prelude");
    expect(prelude?.events).toEqual(["ev/ember-ultimatum", "ev/orin-defies"]);
  });

  it("ships exactly one EXCLUDES pair — Wardens vs the siege — baseline-consistent", () => {
    const canon = verrinCanon();
    const excludes = canon.edges.filter((e) => e.kind === "EXCLUDES");
    expect(excludes).toHaveLength(1);
    expect(excludes[0]).toMatchObject({ from: "ev/wardens-arrive", to: "ev/valdar-besieged" });
    // the excluded side is genuinely un-supported: it requires a dead-end betrayal
    expect(canon.edges.some((e) => e.kind === "REQUIRES" && e.from === "ev/secret-betrayal" && e.to === "ev/valdar-besieged")).toBe(true);
  });

  it("ships one INVARIANT that holds in baseline", () => {
    const canon = verrinCanon();
    const invariants = canon.edges.filter((e) => e.kind === "INVARIANT");
    expect(invariants).toHaveLength(1);
    expect(invariants[0]).toMatchObject({ from: "ev/kael-oath", to: "ev/secret-betrayal" });
  });

  it("hashes deterministically via hashCanon", () => {
    const a = verrinCanon();
    const b = verrinCanon();
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(hashCanon(a));
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is baseline contradiction-free", () => {
    expect(validateCanon(verrinCanon())).toEqual([]);
  });
});

describe("verrinRewindPoint", () => {
  it("anchors at the Blight with an empty cut and fixed metadata", () => {
    const rp = verrinRewindPoint();
    expect(rp.id).toBe("RP-VERRIN-001");
    expect(rp.canonId).toBe("canon/verrin");
    expect(rp.anchorEvent).toBe("ev/blight-begins");
    expect(rp.cut).toEqual([]);
    expect(rp.label).toBe("The Blight begins");
    expect(rp.tags).toEqual(["blight", "cataclysm"]);
    expect(rp.created).toBe("2026-08-30T00:00:00.000Z");
  });

  it("derivedHash matches computeRewindHash exactly (single source of truth)", () => {
    const rp = verrinRewindPoint();
    const canon = verrinCanon();
    expect(rp.derivedHash).toBe(computeRewindHash("canon/verrin", "ev/blight-begins", [], canon.hash));
    expect(rp.derivedHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic", () => {
    const a = verrinRewindPoint();
    const b = verrinRewindPoint();
    expect(a.derivedHash).toBe(b.derivedHash);
    expect(a).toEqual(b);
  });
});
