/**
 * S009 — Subsumption semantics / reduced-history sufficiency.
 *
 * This module ports the S008 reduction into an isolated experiment and states
 * each rule as an explicit claim with its assumptions, so the rules can be
 * ATTACKED rather than assumed.
 *
 * =====================================================================
 * THE REDUCTION, FORMALLY
 * =====================================================================
 *
 * `reduceChain(canon, H)` returns a subsequence of `H` (order-preserving) such
 * that `derive(canon, reduceChain(H))` is semantically indistinguishable from
 * `derive(canon, H)`, where "semantically indistinguishable" means: identical
 * `effectiveSemanticState`, identical `stateHash`, and empty `worldDiff`.
 *
 * Rules (each keys on a *semantic identity*, not on syntax):
 *
 *  R1  LEGAL setFact/relocate      key = (subject, predicate) cell   keep LAST
 *  R2  REJECTED setFact/relocate   key = contradiction id            keep FIRST
 *  R3  negateEvent                 key = target                      keep LAST
 *  R4  forceEvent                  key = target                      keep LAST
 *  R5  retractFact                 key = fact id                     keep FIRST
 *  R6  severEdge / addEdge         key = edge id                     keep LAST
 *
 * ASSUMPTIONS each rule rests on (from reading src/, not assumed):
 *
 *  R1: `overrideFact` (world-state.ts:181) replaces EVERY effective fact for the
 *      cell with ONE derived fact, and `buildModel` stores only the last written
 *      value per cell (`overriddenCells`). So only the last legal write to a
 *      cell survives in the effective-fact list and in the model.
 *      **ASSUMPTION (attackable):** the id of the surviving derived fact depends
 *      only on the base fact list for that cell, NOT on any earlier write to the
 *      same cell. This holds when a cell has AT MOST ONE effective fact, because
 *      a write always leaves exactly one derived fact whose id is reused on the
 *      next write. It is NOT obvious when a cell has MULTIPLE effective facts
 *      (validity windows) and a retract sits between two writes.
 *
 *  R2: a rejected write never touches `overriddenCells`; it is recorded in
 *      `rejectedFactWrites` and rendered by `contradictions.ts:67` as a record
 *      whose id is `contra:<subject>:fact-write-illegal:<reason>` — which does
 *      NOT include the written value. `detectContradictions` keeps the FIRST
 *      record per id (`contradictions.ts:111`).
 *
 *  R3/R4: `negated` is a Set and `forcedBy` is a Map keyed by target; the fold
 *      (`propagation.ts:285-288`) overwrites. Neither depends on earlier writes.
 *
 *  R5: `retractFact` filters the effective list by id and adds to `retracted`.
 *      **ASSUMPTION (attackable):** a retracted id can never return. A later
 *      write to that cell mints `derived:<cell>` (a different id) when the
 *      matching fact is gone — so the original id stays gone.
 *
 *  R6: `resolveEdges` (propagation.ts:161) removes by id then appends, and sorts
 *      at the end, so only the LAST operation per edge id affects the final set.
 *
 * ORDERING: the reduction is order-preserving — survivors keep their original
 * relative order. Rules R1/R3/R4/R6 keep the LAST occurrence (later position);
 * R2/R5 keep the FIRST (earlier position). Cross-rule order is therefore NOT
 * reordered; only subsumed elements are dropped.
 */
import type { Canon, CausalEdge } from "../../src/canon/types";
import { DERIVED_ID_PREFIX } from "../../src/canon/types";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";
import { cellKey } from "../../src/derive/propagation";
import { buildFactVocabulary, factAssertionError } from "../../src/canon/fact-rules";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** The (subject, predicate) cell a fact id belongs to, or null if unknown. */
export function factCellKey(canon: Canon, factId: string): string | null {
  if (factId.startsWith(DERIVED_ID_PREFIX)) {
    try {
      const parsed = JSON.parse(factId.slice(DERIVED_ID_PREFIX.length)) as unknown;
      if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
        return cellKey(parsed[0], parsed[1]);
      }
    } catch {
      return null;
    }
    return null;
  }
  const f = canon.facts.find((x) => x.id === factId);
  return f === undefined ? null : cellKey(f.subject, f.predicate);
}

/** Every canon fact id occupying a cell. */
export function canonFactsOfCell(canon: Canon, subject: string, predicate: string): string[] {
  return canon.facts.filter((f) => f.subject === subject && f.predicate === predicate).map((f) => f.id);
}

interface Write {
  predicate: string;
  value: string | number | boolean | null;
}

function writeOf(iv: Intervention): Write | null {
  if (iv.kind === "setFact") {
    const p = iv.params?.predicate;
    if (typeof p !== "string") return null;
    return { predicate: p, value: (iv.params?.object ?? null) as string | number | boolean | null };
  }
  if (iv.kind === "relocate") {
    return { predicate: "located_in", value: (iv.params?.to ?? null) as string | number | boolean | null };
  }
  return null;
}

function edgeIdOf(iv: Intervention): string | null {
  if (iv.kind === "severEdge") return iv.target;
  if (iv.kind === "addEdge") return (iv.params?.edge as CausalEdge | undefined)?.id ?? null;
  return null;
}

/** Contradiction id a rejected write would render to (contradictions.ts:67). */
export function rejectedContradictionId(subject: string, reason: string): string {
  return `contra:${subject}:fact-write-illegal:${reason}`;
}

/* ------------------------------------------------------------------ */
/* the reduction                                                       */
/* ------------------------------------------------------------------ */

export interface ReductionOptions {
  /**
   * When true, R1 additionally refuses to subsume an earlier legal write to a
   * cell if a retractFact of one of that cell's canon facts occurred between
   * them. This is the "multi-fact cell" guard: it is needed only when a cell can
   * hold more than one effective fact (validity windows). Default false, to
   * reproduce S008's rule exactly.
   */
  multiFactGuard?: boolean;
}

export interface ReductionTrace {
  reduced: Intervention[];
  /** per-rule drop counts, for the coverage matrix */
  dropped: Record<string, number>;
  /** cells that hold >1 canon fact (multi-fact cells) seen in this history */
  multiFactCells: string[];
}

export function reduceChainDetailed(
  canon: Canon,
  chain: Intervention[],
  opts: ReductionOptions = {}
): ReductionTrace {
  const keep = new Array<boolean>(chain.length).fill(true);
  const vocab = buildFactVocabulary(canon);
  const dropped: Record<string, number> = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0 };
  const multiFactCells = new Set<string>();

  const lastCellWrite = new Map<string, number>();
  const firstRejected = new Map<string, number>();
  const lastNegate = new Map<string, number>();
  const lastForce = new Map<string, number>();
  const firstRetract = new Map<string, number>();
  const lastEdgeOp = new Map<string, number>();

  // For the optional multi-fact guard: last retract position per canon fact id.
  const retractPos = new Map<string, number>();
  const setPos = new Map<string, number>();

  for (let i = 0; i < chain.length; i++) {
    const iv = chain[i]!;
    if (iv.kind === "setFact" || iv.kind === "relocate") {
      const w = writeOf(iv);
      if (w === null) continue;
      const error = factAssertionError(iv.target, w.predicate, w.value, vocab);
      if (error !== null) {
        // R2 — rejected write: keep FIRST per contradiction id.
        const cid = rejectedContradictionId(iv.target, error.reason);
        if (firstRejected.has(cid)) {
          keep[i] = false;
          dropped.R2 = (dropped.R2 ?? 0) + 1;
        } else firstRejected.set(cid, i);
      } else {
        // R1 — legal write: keep LAST per cell.
        const cell = cellKey(iv.target, w.predicate);
        const cellFacts = canonFactsOfCell(canon, iv.target, w.predicate);
        if (cellFacts.length > 1) multiFactCells.add(cell);
        const prev = lastCellWrite.get(cell);
        if (prev !== undefined) {
          let blocked = false;
          if (opts.multiFactGuard === true) {
            blocked = cellFacts.some((fid) => (retractPos.get(fid) ?? -1) > prev);
          }
          if (!blocked) {
            keep[prev] = false;
            dropped.R1 = (dropped.R1 ?? 0) + 1;
          }
        }
        lastCellWrite.set(cell, i);
        setPos.set(cell, i);
      }
    } else if (iv.kind === "retractFact") {
      // R5 — retract: keep FIRST per id.
      const prev = firstRetract.get(iv.target);
      if (prev === undefined) firstRetract.set(iv.target, i);
      else {
        keep[i] = false;
        dropped.R5 = (dropped.R5 ?? 0) + 1;
      }
      retractPos.set(iv.target, i);
    } else if (iv.kind === "negateEvent") {
      // R3 — keep LAST per target.
      const prev = lastNegate.get(iv.target);
      if (prev !== undefined) {
        keep[prev] = false;
        dropped.R3 = (dropped.R3 ?? 0) + 1;
      }
      lastNegate.set(iv.target, i);
    } else if (iv.kind === "forceEvent") {
      // R4 — keep LAST per target.
      const prev = lastForce.get(iv.target);
      if (prev !== undefined) {
        keep[prev] = false;
        dropped.R4 = (dropped.R4 ?? 0) + 1;
      }
      lastForce.set(iv.target, i);
    } else if (iv.kind === "severEdge" || iv.kind === "addEdge") {
      // R6 — keep LAST per edge id.
      const id = edgeIdOf(iv);
      if (typeof id === "string") {
        const prev = lastEdgeOp.get(id);
        if (prev !== undefined) {
          keep[prev] = false;
          dropped.R6 = (dropped.R6 ?? 0) + 1;
        }
        lastEdgeOp.set(id, i);
      }
    }
  }

  return {
    reduced: chain.filter((_, i) => keep[i]!),
    dropped,
    multiFactCells: [...multiFactCells].sort(),
  };
}

/** Convenience: the reduced chain only. */
export function reduceChain(canon: Canon, chain: Intervention[], opts: ReductionOptions = {}): Intervention[] {
  return reduceChainDetailed(canon, chain, opts).reduced;
}
