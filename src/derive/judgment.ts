/**
 * Somnium Engine — the judgment model (P-003).
 *
 * REPLACES the single "status lattice" of P-001/P-002, which was not a lattice
 * and conflated four independent questions into one axis:
 *
 *   1. Does the event occur?          (truth / ontological)
 *   2. Do we know whether it occurs?  (epistemic)
 *   3. What grounds it?               (support / derivation)
 *   4. Is the world inconsistent here? (conflict)
 *
 * The old `EventStatus` mixed all four: EXCLUDED (an intervention INPUT) sat at
 * the same rank as ESTABLISHED (a derived conclusion); CONTRADICTORY sat "on
 * top" as if contradiction were a higher degree of establishment; UNKNOWN meant
 * both "no information" and "not yet evaluated"; CONTINGENT is a support notion
 * wearing a truth-value costume.
 *
 * P-003 splits these into orthogonal dimensions and keeps `EventStatus` only as
 * a lossy PROJECTION for reporting and backward compatibility (see
 * `projectStatus`). The engine reasons over `Judgment`, never over the projection.
 *
 * Foundations: Belnap's four-valued logic FOUR (two independent bits — is-true?,
 * is-false?), Kleene three-valued conjunction/disjunction for partial
 * information, and the information order (not the truth order) as the carrier of
 * the fixpoint so that propagation is genuinely monotone.
 */
import type { EventStatus } from "./lattice";

/**
 * Belnap FOUR. Two independent bits: {} / {true} / {false} / {true,false}.
 *
 *   NEITHER — no information. Genuinely epistemic: canon does not say.
 *   TRUE    — occurs in this world.
 *   FALSE   — does not occur in this world.
 *   BOTH    — the world asserts both. A CONFLICT, not a degree of truth.
 *
 * Information order (the fixpoint carrier — monotone, never retracts):
 *   NEITHER ⊑ TRUE ⊑ BOTH
 *   NEITHER ⊑ FALSE ⊑ BOTH
 * TRUE and FALSE are incomparable; their join is BOTH.
 */
export type TruthValue = "NEITHER" | "TRUE" | "FALSE" | "BOTH";

/**
 * The support dimension — orthogonal to truth. Answers "what grounds this?",
 * not "is it true?". This is where CONTINGENT actually belonged.
 *
 *   HARD      — some sufficient support set is fully satisfied (or it is a root).
 *   SOFT      — reachable only via an ENABLES (enabling) path; no hard guarantee.
 *   NONE      — every sufficient support set is refuted.
 *   UNFOUNDED — support exists only through a cycle with no external ground
 *               (well-founded semantics: an unfounded set is false, not unknown).
 */
export type SupportKind = "HARD" | "SOFT" | "NONE" | "UNFOUNDED";

/**
 * The per-node verdict. `forced` and `negated` are intervention INPUTS recorded
 * alongside the derived dimensions — they are not themselves conclusions.
 */
export interface Judgment {
  truth: TruthValue;
  support: SupportKind;
  /** do(X happens) was applied to this node */
  forced: boolean;
  /** do(X never happens) was applied to this node */
  negated: boolean;
}

export const BOTTOM: Judgment = {
  truth: "NEITHER",
  support: "NONE",
  forced: false,
  negated: false,
};

/**
 * Join in the INFORMATION order. This is the operation the fixpoint uses, and
 * it is monotone by construction: information is only ever added.
 *
 * join(TRUE, FALSE) = BOTH — the two bits are independent, so asserting both is
 * a conflict rather than a contest one side wins.
 */
export function joinTruth(a: TruthValue, b: TruthValue): TruthValue {
  if (a === b) return a;
  if (a === "NEITHER") return b;
  if (b === "NEITHER") return a;
  return "BOTH"; // TRUE ⊔ FALSE, and anything ⊔ BOTH
}

/** Strictly-more-information test, for asserting fixpoint monotonicity. */
export function truthRank(t: TruthValue): number {
  switch (t) {
    case "NEITHER":
      return 0;
    case "TRUE":
    case "FALSE":
      return 1;
    case "BOTH":
      return 2;
  }
}

/**
 * Kleene three-valued conjunction over a support group's conjuncts.
 *
 * FALSE dominates (one refuted conjunct refutes the group); TRUE requires ALL
 * conjuncts TRUE; otherwise NEITHER (partial information stays partial — this is
 * what keeps an under-specified prerequisite from collapsing to "impossible").
 *
 * DELIBERATE DEVIATION from truth-functional Belnap: a BOTH conjunct yields
 * FALSE for the group, not BOTH. A contradictory prerequisite cannot soundly
 * ground anything, so it refutes rather than infects. Recorded as a design
 * decision in docs/ARCHITECTURE-RECONNAISSANCE.md §17.
 */
export function conjoin(values: TruthValue[]): TruthValue {
  if (values.length === 0) return "TRUE"; // empty conjunction is vacuously satisfied
  let allTrue = true;
  for (const v of values) {
    if (v === "FALSE" || v === "BOTH") return "FALSE";
    if (v !== "TRUE") allTrue = false;
  }
  return allTrue ? "TRUE" : "NEITHER";
}

/**
 * Kleene three-valued disjunction over alternative sufficient support sets.
 *
 * TRUE dominates (one satisfied sufficient set suffices — this is what makes
 * alternative sufficient causes work); FALSE requires ALL groups refuted;
 * otherwise NEITHER.
 */
export function disjoin(values: TruthValue[]): TruthValue {
  if (values.length === 0) return "TRUE"; // no support requirements => a root
  let allFalse = true;
  for (const v of values) {
    if (v === "TRUE") return "TRUE";
    if (v !== "FALSE") allFalse = false;
  }
  return allFalse ? "FALSE" : "NEITHER";
}

/**
 * Lossy projection to the legacy reporting scale. The engine does NOT reason
 * over this value; diff/query/work-status consumers read it for presentation.
 *
 *   BOTH                      -> CONTRADICTORY  (conflict flag, not a rank)
 *   FALSE by intervention     -> EXCLUDED       (input, distinguished from derived)
 *   TRUE                      -> ESTABLISHED
 *   FALSE derived             -> UNSUPPORTED    (includes UNFOUNDED cycles)
 *   NEITHER with soft support -> CONTINGENT
 *   NEITHER otherwise         -> UNKNOWN        (genuinely epistemic)
 */
export function projectStatus(j: Judgment): EventStatus {
  if (j.truth === "BOTH") return "CONTRADICTORY";
  if (j.truth === "FALSE") return j.negated ? "EXCLUDED" : "UNSUPPORTED";
  if (j.truth === "TRUE") return "ESTABLISHED";
  return j.support === "SOFT" ? "CONTINGENT" : "UNKNOWN";
}

/** True when the node occurs in this world (for fact validity windows). */
export function occurs(j: Judgment): boolean {
  return j.truth === "TRUE" || j.truth === "BOTH";
}
