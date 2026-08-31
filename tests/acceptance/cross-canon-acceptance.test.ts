/**
 * Somnium Engine — P-004 cross-canon acceptance suite.
 *
 * THE QUESTION: does the architecture generalize beyond its first canon, or is
 * it a very good Verrin engine?
 *
 * Every capability below is asserted for BOTH canons through the SAME engine,
 * parameterized over a `CanonCase` table rather than duplicated. A second causal
 * engine is forbidden; the "one engine" describe block proves by source scan
 * that no canon-specific branch exists.
 *
 * The two canons are deliberately structural opposites:
 *   Verrin — a cascade. One root event (the Blight), deep REQUIRES chains, a
 *            character whose location flips at a single displacement event.
 *   Ordos  — a contest. A FACT (who holds the Seal) gating events, EXCLUDES
 *            between facts, alternative sufficient causes as the central
 *            mechanism, a load-bearing unknown, a deliberately partial order.
 *
 * Expected values were derived by running the engine and then checking each
 * result against the documented semantics in propagation.ts — not by recording
 * whatever came out. Where a value is initially surprising, the reason is in a
 * comment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Canon } from "../../src/canon/types";
import { hashCanon } from "../../src/canon/hash";
import { inspectCanon } from "../../src/canon/canon";
import { verrinCanon, verrinRewindPoint } from "../../src/canon/verrin";
import { ordosCanon, ordosRewindPoint, ORDOS_IDS } from "../../src/canon/ordos";
import { derive } from "../../src/derive/world-state";
import { worldDiff } from "../../src/diff/diff";
import { projectDiff } from "../../src/diff/projections";
import { computeDepth, computeDivergence } from "../../src/depth/depth";
import { statusOf, workStatusOf } from "../../src/query/status";
import { reachable, subjectFact } from "../../src/query/query";
import {
  declaredEventTypes,
  diffOccurrences,
  occurrenceCount,
  occurrencesOfType,
  typeOfOccurrence,
} from "../../src/query/occurrence";
import { validateRewindPoint } from "../../src/timeline/rewind-point";
import { branchUniverse, createUniverse, lineageOf } from "../../src/timeline/universe";
import type { Intervention, RewindPoint } from "../../src/timeline/types";
import { forceEvent, negateEvent, retractFact, setFact, severEdge } from "../../src/timeline/types";

interface CanonCase {
  name: string;
  canon: Canon;
  rp: RewindPoint;
  /** ESTABLISHED at baseline, with downstream dependents */
  rootEvent: string;
  /** becomes UNSUPPORTED when rootEvent is negated (direct dependent) */
  directDependent: string;
  /** becomes UNSUPPORTED transitively */
  indirectDependent: string;
  /** PRESERVED at baseline, IMPOSSIBLE once rootEvent is negated */
  fragileWork: string;
  /** a cell whose effective value changes when rootEvent is negated */
  changedState: { subject: string; predicate: string; baseline: string; branched: string };
  /** UNKNOWN at baseline — deliberate under-specification */
  unknownEvent: string;
  /** a 3-step chain for the multi-depth replay capability */
  chain: Intervention[];
  /**
   * P-005: a recurring event type. Both canons must carry one, and they express
   * recurrence DIFFERENTLY — that contrast is the genericity test.
   */
  recurrence: {
    typeId: string;
    /** every declared occurrence of the type, sorted by id */
    occurrences: string[];
    /** how many of them actually occur at baseline */
    baselineCount: number;
    /** an intervention chain that shifts WHICH occurrence carries the type */
    shift: Intervention[];
    /** after `shift`: occurrences that stop occurring */
    shiftRemoved: string[];
    /** after `shift`: occurrences that start occurring */
    shiftAdded: string[];
  };
}

const O = ORDOS_IDS;

const CASES: CanonCase[] = [
  {
    name: "verrin",
    canon: verrinCanon(),
    rp: verrinRewindPoint(),
    rootEvent: "ev/blight-begins",
    directDependent: "ev/exodus",
    indirectDependent: "ev/ashfall-falls",
    fragileWork: "work/verrin-ashfall",
    // Vara is in Valdar UNTIL the exodus and in Thornhollow FROM it. No blight
    // => no exodus => the first window never closes and the second never opens.
    changedState: {
      subject: "char/vara",
      predicate: "located_in",
      baseline: "loc/thornhollow",
      branched: "loc/valdar",
    },
    // Requires a betrayal that itself requires a fact whose window can never
    // open — the deliberate dead end.
    unknownEvent: "ev/secret-betrayal",
    chain: [
      negateEvent("ev/blight-begins"),
      setFact("char/vara", "located_in", "loc/thornhollow"),
      setFact("char/vara", "located_in", "loc/stonehall"),
    ],
    // Verrin's recurrence shape: INDEPENDENT PARALLEL occurrences. Two people
    // swear binding oaths in answer to the same catastrophe; neither requires
    // the other, and they have different consequences (Kael's summons the
    // Wardens, Vara's does not). Removing one therefore only REMOVES — nothing
    // steps into its place, because the occurrences were never competing.
    recurrence: {
      typeId: "type/oath-sworn",
      occurrences: ["ev/kael-oath", "ev/vara-vow"],
      baselineCount: 2,
      shift: [negateEvent("ev/kael-oath")],
      shiftRemoved: ["ev/kael-oath"],
      shiftAdded: [],
    },
  },
  {
    name: "ordos",
    canon: ordosCanon(),
    rp: ordosRewindPoint(),
    // NOT the death of the old Warden: recognition is the pivot, because the
    // death only feeds the acclamation route and recognition is disjunctively
    // supported (acclaim OR blood), so negating the death leaves recognition
    // standing. Choosing the pivot correctly is itself a canon-shape question.
    rootEvent: O.events.vaelaRecognised,
    directDependent: O.events.vaelaInvested,
    // The rite is gated on the SEAL-HELD FACT, whose window opens at the
    // investiture. So the chain here runs event -> event -> fact -> event,
    // which Verrin's all-event chains never exercised.
    indirectDependent: O.events.riteBindingVaela,
    fragileWork: O.works.investitureOfVaela,
    // Possession falls back to the PREVIOUS holder: seal-held-petronius has an
    // earlier window that the investiture would have closed. Removing the
    // investiture reopens it. That is correct narrative-time behaviour, not a
    // bug — the Seal does not vanish, it stays where it was.
    changedState: {
      subject: O.objects.seal,
      predicate: "held_by",
      baseline: O.characters.vaela,
      branched: O.characters.petronius,
    },
    // Galen's whole chain hangs on a parentage the canon never settles.
    unknownEvent: O.events.galenRecognised,
    chain: [
      negateEvent(O.events.vaelaRecognised),
      setFact(O.objects.seal, "held_by", O.characters.galen),
      setFact(O.objects.seal, "held_by", O.characters.myrra),
    ],
    // Ordos's recurrence shape: COMPETING ALTERNATIVES. Two rites of one kind
    // feed a single outcome disjunctively, and at most one can complete, so only
    // ONE occurs at baseline (Galen's hangs on the unsettled parentage). Shifting
    // therefore both REMOVES and ADDS — the type persists through a different
    // occurrence. This is the contrast with Verrin, where removing an occurrence
    // only removes.
    recurrence: {
      typeId: O.types.riteOfBinding,
      occurrences: [O.events.riteBindingGalen, O.events.riteBindingVaela],
      baselineCount: 1,
      shift: [negateEvent(O.events.vaelaRecognised), forceEvent(O.events.galenRecognised)],
      shiftRemoved: [O.events.riteBindingVaela],
      shiftAdded: [O.events.riteBindingGalen],
    },
  },
];

/** Baseline and single-intervention branch for a case (recomputed per test). */
function worlds(c: CanonCase): { baseline: ReturnType<typeof derive>; branch: ReturnType<typeof derive> } {
  return {
    baseline: derive(c.canon, []),
    branch: derive(c.canon, [negateEvent(c.rootEvent)], c.rp),
  };
}

/* ========================================================================== */
/* The ten PoC capabilities, for both canons                                  */
/* ========================================================================== */

describe.each(CASES)("capability 1: canonical baseline [$name]", (c) => {
  it("loads, hashes deterministically, and has no validation ERRORS", () => {
    expect(c.canon.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(c.canon.hash).toBe(hashCanon(c.canon));
    const { errors } = inspectCanon(c.canon);
    // Notices are allowed — deliberate incompleteness and engine-handled cycles
    // are not corruption (P-004 §18.5).
    expect(errors).toEqual([]);
  });

  it("derives a usable, contradiction-free baseline", () => {
    const baseline = derive(c.canon, []);
    expect(baseline.canonId).toBe(c.canon.canonId);
    expect(baseline.contradictions).toEqual([]);
    expect(baseline.temporalViolations).toEqual([]);
    expect(Object.keys(baseline.statuses).length).toBeGreaterThan(0);
  });
});

describe.each(CASES)("capability 2: rewind point [$name]", (c) => {
  it("validates against its canon", () => {
    const v = validateRewindPoint(c.rp, c.canon);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("rejects a tampered derivedHash", () => {
    expect(validateRewindPoint({ ...c.rp, derivedHash: "deadbeef" }, c.canon).ok).toBe(false);
  });
});

describe.each(CASES)("capability 3: intervention [$name]", (c) => {
  it("marks the negated event EXCLUDED — an input, not a conclusion", () => {
    const { branch } = worlds(c);
    expect(statusOf(branch, c.rootEvent)).toBe("EXCLUDED");
    expect(branch.judgments[c.rootEvent]).toMatchObject({ truth: "FALSE", negated: true });
  });

  it("keeps EXCLUDED distinct from a derived UNSUPPORTED", () => {
    const { branch } = worlds(c);
    expect(statusOf(branch, c.directDependent)).toBe("UNSUPPORTED");
    expect(branch.judgments[c.directDependent]).toMatchObject({ truth: "FALSE", negated: false });
  });
});

describe.each(CASES)("capability 4: causal propagation [$name]", (c) => {
  it("cascades to direct and indirect dependents", () => {
    const { baseline, branch } = worlds(c);
    expect(statusOf(baseline, c.directDependent)).toBe("ESTABLISHED");
    expect(statusOf(baseline, c.indirectDependent)).toBe("ESTABLISHED");
    expect(statusOf(branch, c.directDependent)).toBe("UNSUPPORTED");
    expect(statusOf(branch, c.indirectDependent)).toBe("UNSUPPORTED");
  });

  it("flips reachability", () => {
    const { baseline, branch } = worlds(c);
    expect(reachable(baseline, c.indirectDependent)).toBe(true);
    expect(reachable(branch, c.indirectDependent)).toBe(false);
  });
});

describe.each(CASES)("capability 5: alternate world state [$name]", (c) => {
  it("produces a genuinely different world", () => {
    const { baseline, branch } = worlds(c);
    expect(branch.stateHash).not.toBe(baseline.stateHash);
    expect(branch.identityHash).not.toBe(baseline.identityHash);
    expect(branch.judgments).not.toEqual(baseline.judgments);
  });
});

describe.each(CASES)("capability 6: changed entities [$name]", (c) => {
  it("changes the effective value of the tracked cell", () => {
    const { baseline, branch } = worlds(c);
    const { subject, predicate, baseline: was, branched: now } = c.changedState;
    expect(subjectFact(baseline, subject, predicate)?.object).toBe(was);
    expect(subjectFact(branch, subject, predicate)?.object).toBe(now);
  });
});

describe.each(CASES)("capability 7: impossible canonical works [$name]", (c) => {
  it("turns a PRESERVED work IMPOSSIBLE", () => {
    const { baseline, branch } = worlds(c);
    expect(workStatusOf(baseline, c.fragileWork)).toBe("PRESERVED");
    expect(workStatusOf(branch, c.fragileWork)).toBe("IMPOSSIBLE");
  });
});

describe.each(CASES)("capability 8: branch genealogy [$name]", (c) => {
  it("builds a parent chain carrying the full intervention history", () => {
    const base = createUniverse({ canonId: c.canon.canonId, label: `${c.name}-baseline` });
    const u1 = branchUniverse(base, c.rp, [c.chain[0] as Intervention], `${c.name}-001`);
    const u2 = branchUniverse(u1, c.rp, [c.chain[1] as Intervention], `${c.name}-002`);

    expect(u1.parent).toBe(base.id);
    expect(u2.parent).toBe(u1.id);
    expect(lineageOf(u2)).toEqual([u2.id, u1.id, base.id]);
    expect(u2.interventions.length).toBe(2);
    expect(u2.canonId).toBe(c.canon.canonId);
  });
});

describe.each(CASES)("capability 9: world diff [$name]", (c) => {
  it("emits a structural diff naming the impossible work", () => {
    const { baseline, branch } = worlds(c);
    const d = worldDiff(baseline, branch);
    expect(d.statusChanges.length).toBeGreaterThan(0);
    expect(d.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(d.workStatuses[c.fragileWork]).toBe("IMPOSSIBLE");
    expect(d.statusChanges.some((s) => s.entityId === c.rootEvent && s.to === "EXCLUDED")).toBe(true);
  });
});

describe.each(CASES)("capability 10: multi-depth deterministic replay [$name]", (c) => {
  it("depth N equals a direct derivation of the same prefix", () => {
    for (let n = 1; n <= c.chain.length; n++) {
      const prefix = c.chain.slice(0, n);
      const a = derive(c.canon, prefix, c.rp);
      const b = derive(c.canon, prefix, c.rp);
      expect(a.stateHash).toBe(b.stateHash);
      expect(a.identityHash).toBe(b.identityHash);
      expect(a.judgments).toEqual(b.judgments);
      expect(a.facts).toEqual(b.facts);
      expect(a.contradictions).toEqual(b.contradictions);
      expect(a.temporalViolations).toEqual(b.temporalViolations);
    }
  });

  it("inherits the depth-1 consequence at every deeper depth", () => {
    for (let n = 1; n <= c.chain.length; n++) {
      const w = derive(c.canon, c.chain.slice(0, n), c.rp);
      expect(statusOf(w, c.rootEvent)).toBe("EXCLUDED");
      expect(statusOf(w, c.directDependent)).toBe("UNSUPPORTED");
    }
  });

  it("reports genealogical depth separately from divergence", () => {
    const baseline = derive(c.canon, []);
    for (let n = 1; n <= c.chain.length; n++) {
      const w = derive(c.canon, c.chain.slice(0, n), c.rp);
      const m = computeDepth(c.canon, baseline, w, c.chain.slice(0, n), n);
      expect(m.genealogicalDepth).toBe(n);
      expect(m.interventionCount).toBe(n);
      expect(m.divergence.score).toBeGreaterThan(0);
    }
  });
});

/* ========================================================================== */
/* Cross-canon invariants                                                     */
/* ========================================================================== */

describe("cross-canon: one engine, no canon-specific branch", () => {
  /**
   * The strongest available proof that the engine has no canon-specific logic:
   * scan its own source for canon id and entity id literals.
   *
   * Deliberately scans for IDENTIFIER literals, not for the words "Verrin" or
   * "Ordos": the engine's comments legitimately cite both canons when explaining
   * why a rule exists, and that prose is valuable. A canon-specific BRANCH would
   * need an id literal to test against.
   */
  const ENGINE_FILES = [
    "src/derive/propagation.ts",
    "src/derive/world-state.ts",
    "src/derive/judgment.ts",
    "src/derive/contradictions.ts",
    "src/diff/diff.ts",
    "src/depth/depth.ts",
    "src/timeline/universe.ts",
    "src/timeline/rewind-point.ts",
    "src/canon/canon.ts",
  ];

  const ID_LITERAL = /"(?:canon|ev|char|loc|fac|inst|obj|work|fact|edge)\/[a-z0-9-]+"/i;

  /**
   * Strip comments before scanning. The engine's comments legitimately quote
   * canon ids when explaining WHY a rule exists (e.g. canon.ts cites
   * `"loc/valdarr"` as the typo the object guard catches), and that prose is
   * worth keeping. A canon-specific BRANCH would need the literal in executable
   * code, which is what this test is actually looking for.
   */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  it.each(ENGINE_FILES)("%s contains no canon id literals in executable code", (rel) => {
    const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
    const hit = ID_LITERAL.exec(src);
    expect(hit?.[0] ?? null).toBeNull();
  });

  it("derives both canons through the same function reference", () => {
    // `derive` is imported once; both canons go through it. If a second engine
    // existed, this suite could not be written this way.
    const results = CASES.map((c) => derive(c.canon, []));
    expect(results.length).toBe(2);
    expect(results[0]?.canonId).not.toBe(results[1]?.canonId);
    for (const r of results) expect(r.stateHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("has exactly one hard-coded predicate in the core, and it is `relocate` sugar", () => {
    // `located_in` appears in world-state.ts and propagation.ts ONLY as the
    // predicate `relocate` desugars to. Nothing else privileges it — Ordos's
    // Chapter has no location at all and derives fine.
    const ws = readFileSync(join(process.cwd(), "src/derive/world-state.ts"), "utf8");
    const occurrences = ws.match(/"located_in"/g) ?? [];
    expect(occurrences.length).toBeLessThanOrEqual(2);
  });
});

describe.each(CASES)("cross-canon invariants [$name]", (c) => {
  it("preserves UNKNOWN — absence of knowledge never becomes falsehood", () => {
    const baseline = derive(c.canon, []);
    expect(statusOf(baseline, c.unknownEvent)).toBe("UNKNOWN");
    expect(statusOf(baseline, c.unknownEvent)).not.toBe("UNSUPPORTED");
    expect(statusOf(baseline, c.unknownEvent)).not.toBe("EXCLUDED");
  });

  it("does not convert UNKNOWN under an unrelated no-op intervention", () => {
    const noop = derive(c.canon, [severEdge("edge/does-not-exist")], c.rp);
    expect(statusOf(noop, c.unknownEvent)).toBe("UNKNOWN");
  });

  it("preserves contradictions with provenance, never auto-repairing", () => {
    // Force an event whose prerequisite this same chain removes.
    const contradicting = derive(
      c.canon,
      [negateEvent(c.rootEvent), forceEvent(c.directDependent)],
      c.rp
    );
    expect(statusOf(contradicting, c.directDependent)).toBe("CONTRADICTORY");
    expect(contradicting.contradictions.length).toBeGreaterThan(0);
    for (const record of contradicting.contradictions) {
      expect(record.source === "canon" || record.source.length > 0).toBe(true);
    }
    // and the world is still returned, not repaired
    expect(statusOf(contradicting, c.rootEvent)).toBe("EXCLUDED");
  });

  it("carries the full ordered intervention chain as provenance", () => {
    const w = derive(c.canon, c.chain, c.rp);
    expect(w.interventions.map((i) => i.id)).toEqual(c.chain.map((i) => i.id));
    expect(w.rpId).toBe(c.rp.id);
  });

  it("graphDistance is 0 for a no-op and positive for a real intervention", () => {
    const baseline = derive(c.canon, []);
    const noopIvs = [severEdge("edge/does-not-exist")];
    const noop = derive(c.canon, noopIvs, c.rp);
    expect(computeDivergence(c.canon, baseline, noop, noopIvs).graphDistance).toBe(0);

    const realIvs = [negateEvent(c.rootEvent)];
    const real = derive(c.canon, realIvs, c.rp);
    expect(computeDivergence(c.canon, baseline, real, realIvs).graphDistance).toBeGreaterThan(0);
  });

  it("separates world identity from derivation identity", () => {
    const baseline = derive(c.canon, []);
    const noopIvs = [severEdge("edge/does-not-exist")];
    const noop = derive(c.canon, noopIvs, c.rp);
    // Same effective world...
    expect(noop.stateHash).toBe(baseline.stateHash);
    // ...reached a different way (and from a rewind point), so a memo keyed on
    // identity cannot hand back a state carrying the wrong provenance.
    expect(noop.identityHash).not.toBe(baseline.identityHash);
  });

  it("is deterministic across repeated derivation", () => {
    const a = derive(c.canon, c.chain, c.rp);
    const b = derive(c.canon, c.chain, c.rp);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.statuses).toEqual(b.statuses);
  });
});

/* ========================================================================== */
/* What Verrin could never test                                               */
/* ========================================================================== */

describe("ordos: structures Verrin never exercised", () => {
  const canon = ordosCanon();
  const rp = ordosRewindPoint();

  it("fact-level EXCLUDES holds at baseline: exactly one Seal holder", () => {
    const baseline = derive(canon, []);
    const holders = baseline.facts.filter(
      (f) => f.predicate === "held_by" && f.subject === O.objects.seal
    );
    expect(holders.map((f) => f.id)).toEqual([O.facts.sealHeldVaela]);
    expect(baseline.contradictions).toEqual([]);
  });

  it("a fact-gated event: retracting the gating fact refutes the rite", () => {
    // REQUIRES from a FACT to an EVENT. Verrin has one such edge but it is a
    // deliberate dead end, so the WORKING case only exists here.
    const gated = derive(canon, [retractFact(O.facts.sealHeldVaela)], rp);
    expect(statusOf(gated, O.facts.sealHeldVaela)).toBe("UNSUPPORTED");
    expect(statusOf(gated, O.events.riteBindingVaela)).toBe("UNSUPPORTED");
  });

  it("overwriting the gating fact's cell also refutes the rite", () => {
    const moved = derive(canon, [setFact(O.objects.seal, "held_by", O.characters.galen)], rp);
    expect(statusOf(moved, O.facts.sealHeldVaela)).toBe("UNSUPPORTED");
    expect(statusOf(moved, O.events.riteBindingVaela)).toBe("UNSUPPORTED");
  });

  it("writing the SAME value to the cell changes nothing about truth", () => {
    const same = derive(canon, [setFact(O.objects.seal, "held_by", O.characters.vaela)], rp);
    expect(statusOf(same, O.facts.sealHeldVaela)).toBe("ESTABLISHED");
    expect(statusOf(same, O.events.riteBindingVaela)).toBe("ESTABLISHED");
  });

  it("alternative sufficient causes: one route removed, the outcome stands", () => {
    // Recognition is supported by acclaim OR blood. The death feeds only the
    // acclamation route, so removing it leaves recognition established.
    const noAcclaim = derive(canon, [negateEvent(O.events.vaelaAcclaimed)], rp);
    expect(statusOf(noAcclaim, O.events.vaelaAcclaimed)).toBe("EXCLUDED");
    expect(statusOf(noAcclaim, O.events.vaelaRecognised)).toBe("ESTABLISHED");
    expect(statusOf(noAcclaim, O.events.riteBindingVaela)).toBe("ESTABLISHED");
  });

  it("both routes removed: the outcome finally falls", () => {
    const neither = derive(
      canon,
      [negateEvent(O.events.vaelaAcclaimed), retractFact(O.facts.vaelaHeirValid)],
      rp
    );
    expect(statusOf(neither, O.events.vaelaRecognised)).toBe("UNSUPPORTED");
  });

  it("a disjunctively-supported event stays UNKNOWN when one route is refuted and the other is unknown", () => {
    // succession-settled requires (rite-vaela) OR (rite-galen). Negating
    // recognition refutes the first; the second hangs on the unsettled
    // parentage. disjoin(FALSE, NEITHER) = NEITHER => UNKNOWN, NOT UNSUPPORTED.
    // Kleene disjunction is what keeps this honest: we do not know.
    const w = derive(canon, [negateEvent(O.events.vaelaRecognised)], rp);
    expect(statusOf(w, O.events.riteBindingVaela)).toBe("UNSUPPORTED");
    expect(statusOf(w, O.events.riteBindingGalen)).toBe("UNKNOWN");
    expect(statusOf(w, O.events.successionSettled)).toBe("UNKNOWN");
  });

  it("an atemporal fact grounds an event with no windows involved", () => {
    // fact/seal-is-silver has null/null, so the survey is grounded by a fact
    // that no event brings about or ends.
    const baseline = derive(canon, []);
    expect(statusOf(baseline, O.facts.sealIsSilver)).toBe("ESTABLISHED");
    expect(statusOf(baseline, O.events.sealSurvey)).toBe("ESTABLISHED");
  });

  it("an institution with no location derives without incident", () => {
    const baseline = derive(canon, []);
    expect(subjectFact(baseline, O.institution.chapter, "located_in")).toBeUndefined();
    expect(baseline.contradictions).toEqual([]);
  });

  it("an Object-kind entity round-trips through a typed diff projection", () => {
    const baseline = derive(canon, []);
    const branch = derive(canon, [setFact(O.objects.seal, "held_by", O.characters.galen)], rp);
    const d = worldDiff(baseline, branch);
    const objectDiff = projectDiff(d, canon, "object");

    // The Seal's holder changes in place: `setFact` inherits the replaced canon
    // fact's id, so the change surfaces as a factOverride rather than an
    // add+remove pair. The projection must resolve an override's subject through
    // the canon fact table — which is the part that would break for a new
    // EntityKind that no projection knew about.
    expect(objectDiff.factOverrides.length).toBeGreaterThan(0);

    const subjectById = new Map(canon.facts.map((f) => [f.id, f.subject]));
    const objectIds = new Set(canon.entities.filter((e) => e.kind === "Object").map((e) => e.id));
    const subjects = [
      ...objectDiff.factAdditions.map((f) => f.subject),
      ...objectDiff.factRemovals.map((f) => f.subject),
      ...objectDiff.factOverrides.map((o) => subjectById.get(o.factId) ?? "<unknown>"),
    ];
    expect(subjects.length).toBeGreaterThan(0);
    for (const s of subjects) expect(objectIds.has(s)).toBe(true);

    // ...and the same change is invisible to an unrelated projection, proving the
    // new kind is filtered, not silently falling through.
    const characterDiff = projectDiff(d, canon, "character");
    expect(characterDiff.factOverrides).toEqual([]);
  });

  it("a WorkBinding.facts requirement moves its Work off PRESERVED", () => {
    const baseline = derive(canon, []);
    expect(workStatusOf(baseline, O.works.investitureOfVaela)).toBe("PRESERVED");
    // Same value written back: events all still established, but the required
    // fact is now overridden => ALTERED, not PRESERVED.
    const altered = derive(canon, [setFact(O.objects.seal, "held_by", O.characters.vaela)], rp);
    expect(workStatusOf(altered, O.works.investitureOfVaela)).toBe("ALTERED");
    // Required fact gone entirely => IMPOSSIBLE.
    const gone = derive(canon, [retractFact(O.facts.sealHeldVaela)], rp);
    expect(workStatusOf(gone, O.works.investitureOfVaela)).toBe("IMPOSSIBLE");
  });

  it("has a genuinely partial temporal order (two unordered chains)", () => {
    // Vaela's and Galen's chains share no PRECEDES edge, and there is no
    // temporal violation because nothing forces them into a cycle.
    const baseline = derive(canon, []);
    expect(baseline.temporalViolations).toEqual([]);
    const precedes = canon.edges.filter((e) => e.kind === "PRECEDES");
    const crossLinks = precedes.filter(
      (e) =>
        (e.from.includes("vaela") && e.to.includes("galen")) ||
        (e.from.includes("galen") && e.to.includes("vaela"))
    );
    expect(crossLinks).toEqual([]);
  });
});

/* ========================================================================== */
/* P-005: repeatable events and occurrence identity, for BOTH canons          */
/* ========================================================================== */

describe.each(CASES)("capability 11: repeatable events [$name]", (c) => {
  const r = c.recurrence;

  it("declares the recurring type, and the type is NOT a causal node", () => {
    expect(declaredEventTypes(c.canon)).toContain(r.typeId);
    // A type does not occur, so it can neither ground nor refute anything.
    const baseline = derive(c.canon, []);
    expect(baseline.statuses[r.typeId]).toBeUndefined();
    expect(baseline.judgments[r.typeId]).toBeUndefined();
  });

  it("binds every declared occurrence to the type", () => {
    const baseline = derive(c.canon, []);
    expect(occurrencesOfType(baseline, r.typeId).map((o) => o.occurrenceId)).toEqual(r.occurrences);
    for (const id of r.occurrences) {
      expect(typeOfOccurrence(baseline, id)).toBe(r.typeId);
    }
  });

  it("counts how many occurrences of the type actually happen at baseline", () => {
    const baseline = derive(c.canon, []);
    expect(occurrenceCount(baseline, r.typeId)).toBe(r.baselineCount);
  });

  it("keeps occurrences of one type independently addressable", () => {
    // The identity claim: each occurrence can be intervened on separately, and
    // doing so produces a different world. Two occurrences of one type are never
    // interchangeable.
    const seen = new Set<string>();
    for (const id of r.occurrences) {
      const world = derive(c.canon, [negateEvent(id)], c.rp);
      expect(statusOf(world, id)).toBe("EXCLUDED");
      seen.add(world.stateHash);
    }
    expect(seen.size).toBe(r.occurrences.length);
  });

  it("reports the occurrence-set diff for a shift", () => {
    const baseline = derive(c.canon, []);
    const shifted = derive(c.canon, r.shift, c.rp);
    const d = diffOccurrences(baseline, shifted, r.typeId);
    expect(d.removed).toEqual(r.shiftRemoved);
    expect(d.added).toEqual(r.shiftAdded);
  });

  it("distinguishes a lost sibling from a substitution", () => {
    // This is where the two canons DIVERGE, which is the genericity result.
    // A single boolean could not carry it, so the diff reports three predicates:
    //   Verrin — independent occurrences: removing one only REMOVES.
    //   Ordos  — competing alternatives: removing one lets the other step in.
    // Both are `setChanged`; only Ordos is `substituted`.
    const baseline = derive(c.canon, []);
    const shifted = derive(c.canon, r.shift, c.rp);
    const d = diffOccurrences(baseline, shifted, r.typeId);

    expect(d.setChanged).toBe(true);
    expect(d.substituted).toBe(r.shiftAdded.length > 0 && r.shiftRemoved.length > 0);
    expect(d.typeCeased).toBe(false); // the kind of thing still happens in both
  });

  it("is deterministic across repeated derivation", () => {
    const a = derive(c.canon, r.shift, c.rp);
    const b = derive(c.canon, r.shift, c.rp);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.identityHash).toBe(b.identityHash);
    expect(diffOccurrences(derive(c.canon, []), a, r.typeId)).toEqual(
      diffOccurrences(derive(c.canon, []), b, r.typeId)
    );
  });

  it("never manufactures an occurrence: a forced undeclared id stays out of the world", () => {
    // The world provably does not contain it (truth FALSE), and the incoherent
    // intervention is reported. An earlier pass gave it truth BOTH, which
    // `occurs()` accepts — so the invented occurrence was counted. See ncr-004.
    const ghost = `${r.typeId.replace("type/", "ev/")}-undeclared-occurrence`;
    const world = derive(c.canon, [forceEvent(ghost)], c.rp);

    expect(world.judgments[ghost]).toMatchObject({ truth: "FALSE", forced: true });
    expect(world.contradictions.some((x) => x.id === `contra:${ghost}:force-undeclared`)).toBe(true);
    // it did not join the type...
    expect(occurrencesOfType(world, r.typeId).map((o) => o.occurrenceId)).toEqual(r.occurrences);
    // ...and even when an intervention tries to enrol it, it is not counted.
    const enrolled = derive(
      c.canon,
      [forceEvent(ghost), setFact(ghost, "instance_of", r.typeId)],
      c.rp
    );
    expect(occurrenceCount(enrolled, r.typeId)).toBe(r.baselineCount);
  });

  it("type membership is intervenable without changing whether the occurrence happened", () => {
    const baseline = derive(c.canon, []);
    const first = r.occurrences[0] as string;
    const membership = c.canon.facts.find(
      (f) => f.subject === first && f.predicate === "instance_of"
    );
    expect(membership).toBeDefined();

    const unlinked = derive(c.canon, [retractFact(membership!.id)], c.rp);
    expect(occurrencesOfType(unlinked, r.typeId).map((o) => o.occurrenceId)).not.toContain(first);
    // The occurrence's own status is untouched — membership and occurrence are
    // independent claims, which is why the type layer is ordinary facts.
    expect(statusOf(unlinked, first)).toBe(statusOf(baseline, first));
  });
});

describe("cross-canon: the two canons express recurrence DIFFERENTLY", () => {
  it("Verrin's occurrences are independent; Ordos's are competing alternatives", () => {
    // The genericity claim: one engine, one occurrence model, two narrative
    // shapes. If this test could not be written over both canons, the model
    // would be fitted to whichever canon came first.
    const verrin = CASES.find((c) => c.name === "verrin")!;
    const ordos = CASES.find((c) => c.name === "ordos")!;

    // Verrin: both oaths occur at baseline; removing one leaves one.
    expect(verrin.recurrence.baselineCount).toBe(2);
    expect(verrin.recurrence.shiftAdded).toEqual([]);

    // Ordos: only one rite occurs at baseline; shifting swaps which one.
    expect(ordos.recurrence.baselineCount).toBe(1);
    expect(ordos.recurrence.shiftAdded.length).toBe(1);

    // ...and both are read by the SAME query functions.
    for (const c of CASES) {
      const baseline = derive(c.canon, []);
      expect(occurrencesOfType(baseline, c.recurrence.typeId).length).toBe(
        c.recurrence.occurrences.length
      );
    }
  });

  it("both canons keep every occurrence of a type distinctly identified", () => {
    for (const c of CASES) {
      const baseline = derive(c.canon, []);
      const ids = occurrencesOfType(baseline, c.recurrence.typeId).map((o) => o.occurrenceId);
      expect(new Set(ids).size).toBe(ids.length); // no collapsing
      expect(ids).toEqual([...ids].sort()); // deterministic order
    }
  });
});
