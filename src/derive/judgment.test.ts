/**
 * Somnium Engine — judgment model unit tests (P-003).
 *
 * These pin the algebra the whole causal core rests on. If any of these break,
 * the fixpoint's monotonicity and termination arguments break with them.
 */
import { describe, expect, it } from "vitest";
import {
  BOTTOM,
  conjoin,
  disjoin,
  joinTruth,
  occurs,
  projectStatus,
  truthRank,
  type Judgment,
  type TruthValue,
} from "./judgment";

const ALL: TruthValue[] = ["NEITHER", "TRUE", "FALSE", "BOTH"];

function judgment(overrides: Partial<Judgment>): Judgment {
  return { ...BOTTOM, ...overrides };
}

describe("joinTruth: information-order join", () => {
  it("is idempotent", () => {
    for (const v of ALL) expect(joinTruth(v, v)).toBe(v);
  });

  it("is commutative", () => {
    for (const a of ALL) for (const b of ALL) expect(joinTruth(a, b)).toBe(joinTruth(b, a));
  });

  it("is associative", () => {
    for (const a of ALL)
      for (const b of ALL)
        for (const c of ALL) {
          expect(joinTruth(joinTruth(a, b), c)).toBe(joinTruth(a, joinTruth(b, c)));
        }
  });

  it("has NEITHER as identity and BOTH as absorbing", () => {
    for (const v of ALL) {
      expect(joinTruth("NEITHER", v)).toBe(v);
      expect(joinTruth("BOTH", v)).toBe("BOTH");
    }
  });

  it("joins TRUE and FALSE to BOTH — the two bits are independent", () => {
    // This is the crux of the Belnap model: asserting both is a CONFLICT, not a
    // contest that one side wins.
    expect(joinTruth("TRUE", "FALSE")).toBe("BOTH");
  });

  it("never decreases information (monotonicity of the carrier)", () => {
    for (const a of ALL)
      for (const b of ALL) {
        expect(truthRank(joinTruth(a, b))).toBeGreaterThanOrEqual(truthRank(a));
        expect(truthRank(joinTruth(a, b))).toBeGreaterThanOrEqual(truthRank(b));
      }
  });

  it("ranks NEITHER below decided below BOTH", () => {
    expect(truthRank("NEITHER")).toBe(0);
    expect(truthRank("TRUE")).toBe(1);
    expect(truthRank("FALSE")).toBe(1);
    expect(truthRank("BOTH")).toBe(2);
  });
});

describe("conjoin: Kleene conjunction over one sufficient set", () => {
  it("is vacuously satisfied by the empty conjunction (a root)", () => {
    expect(conjoin([])).toBe("TRUE");
  });

  it("requires every conjunct TRUE", () => {
    expect(conjoin(["TRUE", "TRUE"])).toBe("TRUE");
    expect(conjoin(["TRUE"])).toBe("TRUE");
  });

  it("is refuted by any FALSE conjunct", () => {
    expect(conjoin(["TRUE", "FALSE"])).toBe("FALSE");
    expect(conjoin(["NEITHER", "FALSE"])).toBe("FALSE");
  });

  it("stays NEITHER on partial information — absence of knowledge is not falsehood", () => {
    expect(conjoin(["NEITHER"])).toBe("NEITHER");
    expect(conjoin(["TRUE", "NEITHER"])).toBe("NEITHER");
  });

  it("treats a BOTH conjunct as refuting, not infecting (documented deviation)", () => {
    // A contradictory prerequisite cannot soundly ground anything. Propagating
    // BOTH here is what made the old operator non-monotone.
    expect(conjoin(["BOTH"])).toBe("FALSE");
    expect(conjoin(["TRUE", "BOTH"])).toBe("FALSE");
  });
});

describe("disjoin: Kleene disjunction over alternative sufficient sets", () => {
  it("treats no support requirements as a root", () => {
    expect(disjoin([])).toBe("TRUE");
  });

  it("is satisfied by ONE sufficient set — alternative sufficient causes", () => {
    expect(disjoin(["FALSE", "TRUE"])).toBe("TRUE");
    expect(disjoin(["NEITHER", "TRUE"])).toBe("TRUE");
  });

  it("is refuted only when EVERY set is refuted", () => {
    expect(disjoin(["FALSE", "FALSE"])).toBe("FALSE");
    expect(disjoin(["FALSE", "NEITHER"])).toBe("NEITHER");
  });
});

describe("projectStatus: lossy projection to the reporting scale", () => {
  it("maps conflict to CONTRADICTORY regardless of the other axes", () => {
    expect(projectStatus(judgment({ truth: "BOTH" }))).toBe("CONTRADICTORY");
    expect(projectStatus(judgment({ truth: "BOTH", forced: true, negated: true }))).toBe("CONTRADICTORY");
  });

  it("distinguishes intervention-removed (EXCLUDED) from derived-false (UNSUPPORTED)", () => {
    // The old model gave these the same rank, conflating an INPUT with a CONCLUSION.
    expect(projectStatus(judgment({ truth: "FALSE", negated: true }))).toBe("EXCLUDED");
    expect(projectStatus(judgment({ truth: "FALSE" }))).toBe("UNSUPPORTED");
    expect(projectStatus(judgment({ truth: "FALSE", support: "UNFOUNDED" }))).toBe("UNSUPPORTED");
  });

  it("maps occurrence to ESTABLISHED", () => {
    expect(projectStatus(judgment({ truth: "TRUE", support: "HARD" }))).toBe("ESTABLISHED");
  });

  it("separates soft support (CONTINGENT) from no information (UNKNOWN)", () => {
    expect(projectStatus(judgment({ truth: "NEITHER", support: "SOFT" }))).toBe("CONTINGENT");
    expect(projectStatus(judgment({ truth: "NEITHER", support: "NONE" }))).toBe("UNKNOWN");
  });
});

describe("occurs", () => {
  it("is true exactly when the world asserts occurrence", () => {
    expect(occurs(judgment({ truth: "TRUE" }))).toBe(true);
    expect(occurs(judgment({ truth: "BOTH" }))).toBe(true); // asserted, though also denied
    expect(occurs(judgment({ truth: "FALSE" }))).toBe(false);
    expect(occurs(judgment({ truth: "NEITHER" }))).toBe(false);
  });
});
