/**
 * Somnium Engine — contradiction detection.
 *
 * Contradictions are first-class records, NEVER auto-repaired: the world is
 * returned WITH them so the diff lane can surface them. Detection runs over
 * the post-fixpoint status map, scanning in sorted order, so record ids and
 * ordering are deterministic.
 *
 * Sources of contradiction:
 *   1. A FORCED event whose REQUIRES source is EXCLUDED (the intervention
 *      asserts an impossible event). source = the forcing intervention id.
 *   2. EXCLUDES both-established (mutual exclusion violated). One record per
 *      endpoint; source = "canon".
 *   3. INVARIANT violated (source established while target also established).
 *      One record per edge; source = "canon".
 */
import type { ContradictionRecord } from "../diff/types";
import type { EventStatus } from "./lattice";
import type { DerivationModel } from "./propagation";

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

const ESTABLISHEDISH: ReadonlySet<EventStatus> = new Set(["ESTABLISHED", "CONTRADICTORY"]);

/** Deterministic record constructor. */
export function buildContradiction(
  id: string,
  a: string,
  b: string,
  detail: string,
  source: string,
  detectedAt: string
): ContradictionRecord {
  return { id, a, b, detail, source, detectedAt };
}

/** Detect all contradictions in a stabilized world and return them sorted by id. */
export function detectContradictions(
  model: DerivationModel,
  statuses: Record<string, EventStatus>
): ContradictionRecord[] {
  const records: ContradictionRecord[] = [];
  const statusOf = (node: string): EventStatus => statuses[node] ?? "UNKNOWN";

  // 1. Forced event with an EXCLUDED REQUIRES source.
  for (const node of model.nodeIds) {
    const forceId = model.forcedBy.get(node);
    if (forceId === undefined) continue;
    if (statusOf(node) !== "CONTRADICTORY") continue;
    for (const source of model.requiresIn.get(node) ?? []) {
      if (statusOf(source) === "EXCLUDED") {
        records.push(
          buildContradiction(
            `contra:${node}:force-vs-excluded`,
            node,
            source,
            `event ${node} is forced but its prerequisite ${source} is excluded`,
            forceId,
            node
          )
        );
      }
    }
  }

  // 2. EXCLUDES both-established: one record per endpoint.
  for (const edge of model.excludesEdges) {
    const fromStatus = statusOf(edge.from);
    const toStatus = statusOf(edge.to);
    if (fromStatus === "CONTRADICTORY" && toStatus === "CONTRADICTORY") {
      const detail = `mutually exclusive events ${edge.from} and ${edge.to} are both established`;
      records.push(
        buildContradiction(`contra:${edge.id}:excludes:${edge.from}`, edge.from, edge.to, detail, "canon", edge.from)
      );
      records.push(
        buildContradiction(`contra:${edge.id}:excludes:${edge.to}`, edge.to, edge.from, detail, "canon", edge.to)
      );
    }
  }

  // 3. INVARIANT violated: source established while target also established.
  for (const edge of model.invariantEdges) {
    const sourceStatus = statusOf(edge.from);
    const targetStatus = statusOf(edge.to);
    if (ESTABLISHEDISH.has(sourceStatus) && targetStatus === "CONTRADICTORY") {
      records.push(
        buildContradiction(
          `contra:${edge.id}:invariant:${edge.to}`,
          edge.from,
          edge.to,
          `invariant violated: ${edge.from} is established while ${edge.to} is also established`,
          "canon",
          edge.to
        )
      );
    }
  }

  records.sort(byId);
  return records;
}
