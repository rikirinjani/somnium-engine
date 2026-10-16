/**
 * Somnium Engine — contradiction records (P-003).
 *
 * Contradictions are first-class records, NEVER auto-repaired: the world is
 * returned WITH them so the diff lane can surface them.
 *
 * P-003 change: detection no longer re-derives contradictions by scanning a
 * status map. The propagation pipeline already knows exactly which conflict
 * produced each BOTH judgment and why, so it emits `ConflictNote`s and this
 * module renders them as records. That removes a class of bug where the record
 * text and the actual judgment could disagree.
 *
 * Provenance is preserved per record:
 *   - intervention conflicts  -> source = the forcing intervention's id
 *   - constraint violations   -> source = "canon"
 *
 * Unfoundedness is NOT a contradiction. A bootstrap cycle with no external
 * ground is simply unsupported (well-founded semantics), so it produces no
 * record — the world is consistent, it just does not contain those events.
 */
import type { ContradictionRecord } from "../diff/types";
import type { ConflictNote } from "./propagation";

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

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

function render(note: ConflictNote): ContradictionRecord {
  switch (note.kind) {
    case "forced-vs-negated":
      return buildContradiction(
        `contra:${note.node}:force-vs-negate`,
        note.node,
        note.node,
        `event ${note.node} is both forced to happen and negated`,
        note.source,
        note.node
      );
    case "forced-vs-refuted":
      return buildContradiction(
        `contra:${note.node}:force-vs-excluded`,
        note.node,
        note.other,
        `event ${note.node} is forced but its prerequisite ${note.other} does not hold`,
        note.source,
        note.node
      );
    case "forced-undeclared":
      return buildContradiction(
        `contra:${note.node}:force-undeclared`,
        note.node,
        note.node,
        `occurrence ${note.node} is forced but canon never declares it — an intervention may change an occurrence's status, never bring one into existence`,
        note.source,
        note.node
      );
    case "fact-write-illegal": {
      // ONE record kind for every fact-legality rule. The specific rule travels
      // in `factError.reason`, so adding a rule needs no new ConflictNote kind —
      // and cannot create an unreachable one, which is what happened when there
      // were separate `-subject` and `-object` kinds and Phase D.0 hardcoded the
      // first (the second was dead code, and the docs promised a record the
      // engine could not emit).
      const reason = note.factError?.reason ?? "illegal";
      const detail = note.factError?.detail ?? "illegal fact assertion";
      return buildContradiction(
        `contra:${note.node}:fact-write-illegal:${reason}`,
        note.node,
        note.factError?.offender ?? note.node,
        `cannot write ${note.node}.${note.other}: ${detail} — canon defines the vocabulary, an intervention selects among it`,
        note.source,
        note.node
      );
    }
    case "excludes":
      return buildContradiction(
        `contra:${note.edgeId ?? "excludes"}:excludes:${note.node}`,
        note.node,
        note.other,
        `mutually exclusive events ${note.node} and ${note.other} both occur`,
        note.source,
        note.node
      );
    case "invariant":
      return buildContradiction(
        `contra:${note.edgeId ?? "invariant"}:invariant:${note.node}`,
        note.other,
        note.node,
        `invariant violated: ${note.other} occurs, which prohibits ${note.node}, but ${note.node} also occurs`,
        note.source,
        note.node
      );
  }
}

/** Render the pipeline's conflicts as sorted, deduplicated records. */
export function detectContradictions(conflicts: ConflictNote[]): ContradictionRecord[] {
  const byKey = new Map<string, ContradictionRecord>();
  for (const note of conflicts) {
    const record = render(note);
    if (!byKey.has(record.id)) byKey.set(record.id, record);
  }
  return [...byKey.values()].sort(byId);
}
