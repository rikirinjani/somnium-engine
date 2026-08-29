/**
 * Somnium Engine — rewind-point validation.
 *
 * A Rewind Point is a canonical cut over narrative time, NOT a tick. The cut is
 * the downward-closed set of event ids (under PRECES) that have already
 * occurred at the anchor moment. Validation recomputes the derived hash (single
 * source of truth: `computeRewindHash` in src/canon/hash.ts), checks the canon
 * binding, and verifies the cut is a downward-closed set of real canon event ids.
 */
import { computeRewindHash } from "../canon/hash";
import type { Canon } from "../canon/types";
import type { RewindPoint } from "./types";

export function validateRewindPoint(rp: RewindPoint, canon: Canon): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Tamper detection: derivedHash must equal the canonical recomputation.
  const recomputed = computeRewindHash(rp.canonId, rp.anchorEvent, rp.cut, canon.hash);
  if (recomputed !== rp.derivedHash) {
    errors.push("derivedHash mismatch (tampered)");
  }

  // 2. Canon binding.
  if (rp.canonId !== canon.canonId) {
    errors.push(`canonId mismatch: rewind point bound to "${rp.canonId}", canon is "${canon.canonId}"`);
  }

  // 3. Cut integrity: only real canon event ids, downward-closed under PRECEDES.
  const eventIds = new Set(canon.entities.filter((e) => e.kind === "Event").map((e) => e.id));
  const inCut = new Set(rp.cut);

  for (const eventId of inCut) {
    if (!eventIds.has(eventId)) {
      errors.push(`cut contains unknown event id "${eventId}"`);
    }
  }

  for (const edge of canon.edges) {
    if (edge.kind !== "PRECEDES") continue;
    // Only event predecessors are cut-eligible; fact/constraint endpoints cannot
    // appear in an event cut, so they impose no downward-closure obligation.
    if (inCut.has(edge.to) && eventIds.has(edge.from) && !inCut.has(edge.from)) {
      errors.push(
        `cut not downward-closed: "${edge.from}" PRECEDES "${edge.to}" but "${edge.from}" is missing from the cut`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
