/**
 * Somnium Engine — universe genealogy unit tests (inline fixtures).
 */
import { describe, expect, it } from "vitest";
import { negateEvent, setFact } from "./types";
import type { RewindPoint } from "./types";
import { branchUniverse, createUniverse, lineageOf } from "./universe";

function makeRewindPoint(id = "RP-TEST-001"): RewindPoint {
  return {
    id,
    canonId: "canon/test",
    anchorEvent: "ev/blight-begins",
    cut: ["ev/blight-begins"],
    derivedHash: "00000000",
    label: "test rp",
    tags: [],
    created: "2026-08-30T00:00:00.000Z",
  };
}

describe("universe genealogy", () => {
  it("createUniverse roots at U-BASELINE with empty ancestry", () => {
    const base = createUniverse({ canonId: "canon/test", label: "U-BASELINE" });
    expect(base.id).toBe("U-BASELINE");
    expect(base.canonId).toBe("canon/test");
    expect(base.parent).toBeNull();
    expect(base.rpId).toBeNull();
    expect(base.interventions).toEqual([]);
    expect(lineageOf(base)).toEqual([base.id]);
  });

  it("branchUniverse carries the FULL intervention chain and builds a lineage", () => {
    const base = createUniverse({ canonId: "canon/test", label: "root" });
    const rp = makeRewindPoint();
    const u001 = branchUniverse(base, rp, [negateEvent("ev/blight-begins")], "U-001");
    const u002 = branchUniverse(u001, rp, [setFact("char/vara", "located_in", "loc/thornhollow")], "U-002");

    expect(u001.parent).toBe(base.id);
    expect(u001.rpId).toBe(rp.id);
    expect(u001.interventions.map((i) => i.id)).toEqual(["negateEvent:ev/blight-begins"]);

    expect(u002.parent).toBe(u001.id);
    expect(u002.interventions).toHaveLength(2); // full chain from baseline, not just the new one
    expect(u002.interventions[0]).toEqual(negateEvent("ev/blight-begins"));
    expect(u002.interventions[1]).toEqual(setFact("char/vara", "located_in", "loc/thornhollow"));

    expect(lineageOf(u002)).toEqual([u002.id, u001.id, base.id]);
  });

  it("branch ids are deterministic and sequential", () => {
    const base = createUniverse({ canonId: "canon/test", label: "root" });
    const u1 = branchUniverse(base, makeRewindPoint(), [], "c1");
    const u2 = branchUniverse(u1, makeRewindPoint(), [], "c2");
    expect(u1.id).toMatch(/^U-\d{3}$/);
    expect(u2.id).toMatch(/^U-\d{3}$/);
    expect(u1.id < u2.id).toBe(true);
  });
});
