/**
 * Somnium Engine — occurrence/type queries (P-005).
 *
 * An `Event` in SE has always been an OCCURRENCE: a point in narrative time that
 * anchors fact validity windows, terminates PRECEDES edges, and is what an
 * intervention names. P-005 added `EntityKind: "EventType"` so a canon can say
 * that two occurrences are the same KIND of happening.
 *
 * The link is an ordinary fact (`occurrence --instance_of--> type`), so
 * everything here is a query over effective facts. Deliberately NOT in the
 * causal core: a type does not occur, so it can neither ground nor refute
 * anything, and `propagation.ts` knows nothing about any of this.
 *
 * OCCURRENCE IDENTITY. An occurrence is identified by its declared canon id and
 * by nothing else. Not by type, participants, temporal position, location, or
 * causal provenance — every one of those can be shared by two distinct
 * occurrences. Two rites with the same performer in the same hall with no
 * distinguishing fact remain distinguishable because they are distinct declared
 * nodes; negating one yields a different world from negating the other.
 * Identity is declarational, never derived from attributes.
 */
import { INSTANCE_OF } from "../canon/types";
import type { Canon } from "../canon/types";
import type { WorldState } from "../derive/world-state";
import type { EventStatus } from "../derive/lattice";
import { occurs } from "../derive/judgment";

/** How an occurrence of some type stands in a derived world. */
export interface OccurrenceView {
  /** the occurrence's declared canon id — its identity */
  occurrenceId: string;
  /** the EventType id it is an instance of */
  typeId: string;
  status: EventStatus;
  /** true when the world asserts it happened (TRUE or BOTH) */
  occurred: boolean;
}

const byOccurrenceId = (a: OccurrenceView, b: OccurrenceView): number =>
  a.occurrenceId.localeCompare(b.occurrenceId);

/**
 * Every occurrence of `typeId` in this world, whether or not it occurred,
 * sorted by occurrence id.
 *
 * Reads EFFECTIVE facts, so an intervention that retracts an `instance_of` fact
 * removes the occurrence from its type — the type layer is intervenable like any
 * other fact, without the causal engine knowing types exist.
 */
export function occurrencesOfType(ws: WorldState, typeId: string): OccurrenceView[] {
  const out: OccurrenceView[] = [];
  for (const fact of ws.facts) {
    if (fact.predicate !== INSTANCE_OF || fact.object !== typeId) continue;
    const judgment = ws.judgments[fact.subject];
    out.push({
      occurrenceId: fact.subject,
      typeId,
      status: ws.statuses[fact.subject] ?? "UNKNOWN",
      occurred: judgment !== undefined && occurs(judgment),
    });
  }
  out.sort(byOccurrenceId);
  return out;
}

/** The type an occurrence belongs to, or undefined when it is untyped. */
export function typeOfOccurrence(ws: WorldState, occurrenceId: string): string | undefined {
  const fact = ws.facts.find((f) => f.subject === occurrenceId && f.predicate === INSTANCE_OF);
  return typeof fact?.object === "string" ? fact.object : undefined;
}

/**
 * How many occurrences of `typeId` actually happened in this world.
 *
 * This is the quantity a future `do(EventType occurs exactly N times)`
 * intervention would constrain. P-005 deliberately does NOT implement that
 * intervention (see §19.5): a type-quantified intervention has no unique
 * satisfying world — "exactly once" does not say WHICH occurrence survives — so
 * it is a search problem, not a derivation. Counting is well-defined and
 * sufficient for asking the question.
 */
export function occurrenceCount(ws: WorldState, typeId: string): number {
  return occurrencesOfType(ws, typeId).filter((o) => o.occurred).length;
}

/** Every EventType a canon declares, sorted. */
export function declaredEventTypes(canon: Canon): string[] {
  return canon.entities
    .filter((e) => e.kind === "EventType")
    .map((e) => e.id)
    .sort();
}

/**
 * How a type's occurrence set changed between two worlds — the mission's
 * "event type remains but occurrence identity changes" case.
 *
 * A projection over derived state, NOT a new WorldDiff field: the underlying
 * status changes are already in the diff, and this reads them per type.
 *
 * THREE OUTCOMES, NOT ONE FLAG. A first attempt carried a single
 * `identityShifted` boolean, and the two seed canons immediately pulled it in
 * opposite directions: Verrin's oaths are independent, so removing one *only*
 * removes; Ordos's rites compete, so removing one lets the other step in. Both
 * are "the occurrence set changed while the type persists", but only the second
 * is an occurrence *substitution*, and collapsing them lost exactly the
 * distinction the mission asked for. Hence three named predicates.
 */
export interface OccurrenceSetDiff {
  typeId: string;
  /** occurred in `branch` but not in `baseline` */
  added: string[];
  /** occurred in `baseline` but not in `branch` */
  removed: string[];
  /** occurred in both */
  retained: string[];
  /** occurred in both worlds but with a different status (e.g. ESTABLISHED -> CONTRADICTORY) */
  statusChanged: { occurrenceId: string; from: EventStatus; to: EventStatus }[];
  /**
   * The type still happens in both worlds, but through a different set of
   * occurrences. True for Verrin's "one of two oaths is gone" AND for Ordos's
   * "a different rite carries it".
   */
  setChanged: boolean;
  /**
   * The type still happens in both worlds and a DIFFERENT occurrence carries it:
   * something was both added and removed. The strict reading of "event type
   * remains but occurrence identity changes" — one occurrence substituted for
   * another. False when a sibling was merely lost.
   */
  substituted: boolean;
  /**
   * The type happened in `baseline` and happens in `branch` not at all. Not an
   * identity change: the kind of thing stopped happening.
   */
  typeCeased: boolean;
}

export function diffOccurrences(
  baseline: WorldState,
  branch: WorldState,
  typeId: string
): OccurrenceSetDiff {
  const base = occurrencesOfType(baseline, typeId);
  const brch = occurrencesOfType(branch, typeId);

  const baseOccurred = new Set(base.filter((o) => o.occurred).map((o) => o.occurrenceId));
  const brchOccurred = new Set(brch.filter((o) => o.occurred).map((o) => o.occurrenceId));

  const added = [...brchOccurred].filter((id) => !baseOccurred.has(id)).sort();
  const removed = [...baseOccurred].filter((id) => !brchOccurred.has(id)).sort();
  const retained = [...baseOccurred].filter((id) => brchOccurred.has(id)).sort();

  const baseStatus = new Map(base.map((o) => [o.occurrenceId, o.status]));
  const statusChanged: OccurrenceSetDiff["statusChanged"] = [];
  for (const o of brch) {
    const before = baseStatus.get(o.occurrenceId);
    if (before !== undefined && before !== o.status) {
      statusChanged.push({ occurrenceId: o.occurrenceId, from: before, to: o.status });
    }
  }
  statusChanged.sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId));

  const typePersists = baseOccurred.size > 0 && brchOccurred.size > 0;

  return {
    typeId,
    added,
    removed,
    retained,
    statusChanged,
    setChanged: typePersists && (added.length > 0 || removed.length > 0),
    substituted: typePersists && added.length > 0 && removed.length > 0,
    typeCeased: baseOccurred.size > 0 && brchOccurred.size === 0,
  };
}
