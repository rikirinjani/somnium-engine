/**
 * Somnium Engine — narrative queries over a derived world.
 */
import type { FactView, WorldState } from "../derive/world-state";

/**
 * The effective fact matching subject + predicate, preferring the most recently
 * valid one (latest validFrom). Returns undefined when none exists.
 *
 * Works for ANY subject — a character, a location, an institution, an object —
 * which is why it is named `subjectFact` (P-004). The pre-P-004 name
 * `characterFact` is retained as a deprecated alias.
 *
 * FactView carries no validity window in its declared shape, so recency is read
 * defensively when the derive lane attaches one; otherwise the tie-break falls
 * back to the last matching effective fact (derive emits effective facts in
 * validity order).
 */
export function subjectFact(ws: WorldState, subjectId: string, predicate: string): FactView | undefined {
  const matches = ws.facts.filter((f) => f.subject === subjectId && f.predicate === predicate);
  if (matches.length === 0) return undefined;
  const validFrom = (f: FactView): string => (f as unknown as { validFrom?: string }).validFrom ?? "";
  const sorted = [...matches].sort((a, b) => validFrom(a).localeCompare(validFrom(b)));
  return sorted[sorted.length - 1];
}

/** @deprecated use subjectFact */
export const characterFact = subjectFact;

/** An event is reachable when its status is ESTABLISHED or CONTINGENT. */
export function reachable(ws: WorldState, eventId: string): boolean {
  const s = ws.statuses[eventId];
  return s === "ESTABLISHED" || s === "CONTINGENT";
}
