/**
 * Somnium Engine — status lattice.
 *
 * Event/Work statuses form a lattice so that propagation is a monotone
 * fixpoint that always terminates and is order-independent.
 *
 *   UNKNOWN (bottom)
 *     < UNSUPPORTED   (evaluated; no valid derivation path)
 *     < CONTINGENT    (derivable only via soft/enabling paths)
 *     < ESTABLISHED   (all hard prerequisites satisfied)
 *   EXCLUDED          (blocked by EXCLUDES/INVARIANT edge or negated) — incomparable with ESTABLISHED
 *   CONTRADICTORY (top): join(ESTABLISHED, EXCLUDED)
 *
 * NOTE: "ALTERED" is deliberately NOT a status. An event that still occurs
 * with changed parameters keeps status ESTABLISHED; its alteredness lives in
 * the WorldDiff. (See docs/ARCHITECTURE-RECONNAISSANCE.md §6.)
 */
export type EventStatus =
  | "UNKNOWN"
  | "UNSUPPORTED"
  | "CONTINGENT"
  | "ESTABLISHED"
  | "EXCLUDED"
  | "CONTRADICTORY";

/**
 * User-facing classification of a canonical Work in a branch.
 * Derived from member-event statuses + the WorldDiff; not a lattice value.
 */
export type WorkStatus =
  | "PRESERVED" // all events established, zero diff
  | "ALTERED" // all events established, but parameter diff non-empty
  | "IMPOSSIBLE" // some event unsupported/excluded (prerequisite missing)
  | "UNREACHABLE" // events derivable only via soft paths, none established
  | "CAUSALLY_DISCONNECTED" // events unsupported with no path at all
  | "UNKNOWN";

/** Rank used for deterministic ordering of statuses in output. */
export const STATUS_RANK: Record<EventStatus, number> = {
  UNKNOWN: 0,
  UNSUPPORTED: 1,
  CONTINGENT: 2,
  ESTABLISHED: 3,
  EXCLUDED: 3, // incomparable with ESTABLISHED; tie broken by the special cases below
  CONTRADICTORY: 4,
};

/**
 * Lattice join. Deterministic; used by the propagation fixpoint.
 */
export function joinStatuses(a: EventStatus, b: EventStatus): EventStatus {
  if (a === b) return a;
  if (a === "CONTRADICTORY" || b === "CONTRADICTORY") return "CONTRADICTORY";
  if ((a === "ESTABLISHED" && b === "EXCLUDED") || (a === "EXCLUDED" && b === "ESTABLISHED")) {
    return "CONTRADICTORY";
  }
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}
