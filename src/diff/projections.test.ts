/**
 * Somnium Engine — typed diff projection unit tests.
 *
 * P-004: the `object` projection maps to the `EntityKind "Object"` (artifacts,
 * relics, regalia). The audit's concern was a new kind SILENTLY FALLING THROUGH
 * a projection filter — so these tests assert both that "object" selects Object
 * facts and that Object facts do NOT leak into the other projections.
 *
 * `typedDiff`'s return shape (src/diff/types.ts, owned by another lane) has no
 * `object` member yet, so this exercises `projectDiff` directly.
 */
import { describe, expect, it } from "vitest";
import type { Canon, Entity } from "../canon/types";
import { hashCanon } from "../canon/hash";
import { projectDiff } from "./projections";
import type { WorldDiff } from "./types";
import type { Fact } from "../canon/types";

function fact(id: string, subject: string, object: string): Fact {
  return { id, subject, predicate: "held_by", object, validFrom: null, validTo: null, source: "canon" };
}

function canonWith(extra: Entity[]): Canon {
  const entities: Entity[] = [
    { id: "char/vara", kind: "Character", name: "Vara" },
    { id: "loc/valdar", kind: "Location", name: "Valdar" },
    { id: "obj/seal", kind: "Object", name: "The Seal of Office" },
    ...extra,
  ];
  const canon: Canon = {
    canonId: "canon/projection-unit",
    version: "0.0.1",
    entities,
    facts: [],
    edges: [],
    workBindings: [],
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

function diffWith(facts: Fact[]): WorldDiff {
  return {
    statusChanges: [],
    factAdditions: facts,
    factRemovals: [],
    factOverrides: [],
    edgeChanges: [],
    contradictionsIntroduced: [],
    contradictionsResolved: [],
    constraintViolationsIntroduced: [],
    constraintViolationsResolved: [],
    temporalViolationsIntroduced: [],
    temporalViolationsResolved: [],
    reachabilityChanges: [],
    workStatusChanges: [],
    hash: "",
  };
}

describe("projectDiff with EntityKind Object (P-004)", () => {
  it("the object projection selects facts whose subject is an Object entity", () => {
    const canon = canonWith([]);
    const sealHeld = fact("fact/seal-held-vara", "obj/seal", "char/vara");
    const d = projectDiff(diffWith([sealHeld]), canon, "object");
    expect(d.factAdditions.map((f) => f.id)).toEqual(["fact/seal-held-vara"]);
  });

  it("Object facts do NOT silently fall through into the character/location projections", () => {
    const canon = canonWith([]);
    const d = diffWith([
      fact("fact/seal-held-vara", "obj/seal", "char/vara"),
      fact("fact/vara-in-valdar", "char/vara", "loc/valdar"),
    ]);
    const chars = projectDiff(d, canon, "character");
    expect(chars.factAdditions.map((f) => f.id)).toEqual(["fact/vara-in-valdar"]);
    const locs = projectDiff(d, canon, "location");
    expect(locs.factAdditions).toEqual([]); // location facts are about objects, not locations
  });

  it("an unknown kind in the kind map is ignored by every projection (no crash, no leak)", () => {
    // A canon may contain entities whose kind this engine build does not
    // project; the filters must simply never match them.
    const canon = canonWith([{ id: "inst/academy", kind: "Institution", name: "Academy" }]);
    const d = diffWith([fact("fact/academy-in-valdar", "inst/academy", "loc/valdar")]);
    for (const kind of ["character", "location", "faction", "object", "event"] as const) {
      const projected = projectDiff(d, canon, kind);
      expect(projected.factAdditions).toEqual([]);
    }
  });
});
