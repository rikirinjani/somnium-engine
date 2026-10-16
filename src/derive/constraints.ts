/**
 * Somnium Engine — cardinality constraint evaluation (P-006).
 *
 * Evaluates Canon.constraints over the EFFECTIVE occurrence set of a derived
 * world. This is a projection of the derived world — it reads occurrenceCount
 * (which reads effective facts), so it is deterministic and per-world.
 *
 * SEMANTIC BOUNDARIES (docs §19, experiments/p006/predictions.md):
 *
 *   - causal impossibility  — a prerequisite is absent; status UNSUPPORTED.
 *   - contradiction         — the world asserts P and ¬P; status CONTRADICTORY.
 *   - constraint violation  — this module. An occurrence-count bound is
 *     exceeded. The extra occurrence KEEPS its causal status; the world is not
 *     mutated to become valid; nothing is auto-removed; no event becomes
 *     impossible. The violation is a first-class record with provenance.
 *
 * These three are deliberately distinct statuses/records and must never
 * collapse into one another (prediction G3).
 */
import type { Canon, CardinalityConstraint } from "../canon/types";
import type { WorldState } from "./world-state";
import { occurrenceCount } from "../query/occurrence";

/** A violated cardinality bound, with provenance. */
export interface ConstraintViolationRecord {
  id: string; // e.g. "violation/rite-at-most-one"
  constraintId: string;
  typeId: string;
  bound: "AT_MOST_ONE" | "AT_LEAST_ONE";
  /** the observed count of ESTABLISHED occurrences of typeId in this world */
  observed: number;
  /** the bound, for comparison */
  limit: number;
  detail: string;
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/** How many occurrences of `bound` are permitted? (AT_MOST_ONE → 1, etc.) */
function limitOf(bound: CardinalityConstraint["bound"]): number {
  return bound === "AT_MOST_ONE" ? 1 : 1;
}

/**
 * Evaluate every constraint against the effective occurrence counts of the
 * world. Pure, deterministic, sorted by violation id.
 */
export function evaluateConstraints(canon: Canon, world: WorldState): ConstraintViolationRecord[] {
  const constraints = canon.constraints ?? [];
  const violations: ConstraintViolationRecord[] = [];

  for (const constraint of constraints) {
    const observed = occurrenceCount(world, constraint.typeId);
    if (constraint.bound === "AT_MOST_ONE" && observed > 1) {
      violations.push({
        id: `violation/${constraint.id}`,
        constraintId: constraint.id,
        typeId: constraint.typeId,
        bound: constraint.bound,
        observed,
        limit: 1,
        detail: `AT_MOST_ONE(${constraint.typeId}) violated: ${observed} occurrences occur, at most 1 permitted`,
      });
    } else if (constraint.bound === "AT_LEAST_ONE" && observed < 1) {
      violations.push({
        id: `violation/${constraint.id}`,
        constraintId: constraint.id,
        typeId: constraint.typeId,
        bound: constraint.bound,
        observed,
        limit: 1,
        detail: `AT_LEAST_ONE(${constraint.typeId}) violated: ${observed} occurrences occur, at least 1 required`,
      });
    }
  }

  violations.sort(byId);
  return violations;
}
