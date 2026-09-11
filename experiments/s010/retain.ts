/**
 * S010 — Fold-derived sufficient history.
 *
 * RESEARCH QUESTION
 *   Can Somnium derive a semantics-preserving sufficient intervention history
 *   FROM the authoritative semantic fold, without building a second semantic
 *   engine?
 *
 *   target:   full history -> authoritative fold -> retained history
 *   rejected: full history -> independent reducer -> reduced history -> fold
 *
 * WHAT THE AUTHORITATIVE FOLD EXPOSES (from reading src/):
 *   `buildModel(canon, interventions)` -> DerivationModel, whose accumulators are:
 *     negated: Set<target>            forceEvent/negateEvent results
 *     forcedBy: Map<target, id>
 *     retracted: Set<factId>
 *     overriddenCells: Map<cell, value>   (LAST write per cell ONLY)
 *     rejectedFactWrites: {subject, predicate, source, error}[]
 *     edges: CausalEdge[]                 (final resolved set)
 *   `derive(canon, interventions)` -> WorldState, whose `facts: FactView[]` is the
 *   effective fact list WITH the ids the fold assigned/reused.
 *
 * THE S009 LESSON, RESTATED FOR THIS EXPERIMENT. The effective-fact ID depends on
 * the ORDER of writes and retracts (overrideFact reuses the last matching fact's
 * id). `overriddenCells` keeps only the last VALUE per cell, so an
 * accumulator-only retention cannot see that an earlier write removed a sibling
 * fact. `WorldState.facts` DOES carry the resulting ids, so a retention driven by
 * the effective fact list can see it.
 *
 * Two mechanisms are implemented and compared — neither is assumed correct:
 *
 *   M-B  accumulator-only    uses only DerivationModel accumulators
 *   M-H  oracle-guided       uses `derive` itself as the oracle (state-change test)
 *
 * M-H contains NO semantic rules: it asks the fold whether an intervention changed
 * the world, and drops it if not. M-B re-encodes accumulator entries as operations.
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
import { derive, type WorldState } from "../../src/derive/world-state";
import { buildModel } from "../../src/derive/propagation";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { worldDiff } from "../../src/diff/diff";
import { canonicalJson } from "../../src/canon/hash";

/* ------------------------------------------------------------------ */
/* shared: encode the final edge set as operations                     */
/* ------------------------------------------------------------------ */

function encodeEdges(canon: Canon, edges: CausalEdge[]): Intervention[] {
  const out: Intervention[] = [];
  const canonById = new Map(canon.edges.map((e) => [e.id, e]));
  const modelById = new Map(edges.map((e) => [e.id, e]));
  // severs first (remove canon edges absent from the target set)
  for (const e of canon.edges) {
    if (!modelById.has(e.id)) out.push(severEdge(e.id, "fold"));
  }
  // then adds (target edges not in canon, or changed)
  for (const e of edges) {
    const c = canonById.get(e.id);
    if (c === undefined || canonicalJson(c) !== canonicalJson(e)) out.push(addEdge({ ...e }, "fold"));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* M-B — accumulator-only retention                                    */
/* ------------------------------------------------------------------ */

/**
 * Re-encode the model's accumulators as operations. This is the "obvious"
 * fold-driven mechanism: every surviving accumulator entry becomes one operation.
 *
 * NOTE: this deliberately uses `overriddenCells` (last value per cell) and NOT
 * `WorldState.facts`. That is the point of the mechanism — and the reason it is
 * expected to fail NCR-006.
 */
export function retainFromAccumulators(canon: Canon, H: Intervention[]): Intervention[] {
  const model = buildModel(canon, H);
  const out: Intervention[] = [];

  // retractions (set-like)
  for (const id of [...model.retracted].sort()) out.push(retractFact(id, "fold"));
  // cell writes (LAST value per cell)
  for (const [cell, value] of [...model.overriddenCells.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let subject: string | undefined;
    let predicate: string | undefined;
    try {
      const parsed = JSON.parse(cell) as unknown;
      if (Array.isArray(parsed) && parsed.length === 2) {
        subject = String(parsed[0]);
        predicate = String(parsed[1]);
      }
    } catch {
      continue;
    }
    if (subject === undefined || predicate === undefined) continue;
    out.push(setFact(subject, predicate, value, "fold"));
  }
  // rejected writes: re-emit the ORIGINAL rejected interventions (the model only
  // stores {subject, predicate, source, error}, not the value, so we keep the
  // originals from H that the model flagged).
  for (const iv of H) {
    if (iv.kind === "setFact" || iv.kind === "relocate") {
      const predicate = iv.kind === "setFact" ? iv.params?.predicate : "located_in";
      if (typeof predicate !== "string") continue;
      const isRejected = model.rejectedFactWrites.some((r) => r.subject === iv.target && r.predicate === predicate);
      if (isRejected) out.push(iv);
    }
  }
  // negate / force
  for (const t of [...model.negated].sort()) out.push(negateEvent(t, "fold"));
  for (const t of [...model.forcedBy.keys()].sort()) out.push(forceEvent(t, "fold"));
  // edges
  out.push(...encodeEdges(canon, model.edges));
  return out;
}

/* ------------------------------------------------------------------ */
/* M-H — oracle-guided retention (uses derive as the only authority)   */
/* ------------------------------------------------------------------ */

export interface RetainTrace {
  retained: Intervention[];
  /** how many interventions the oracle judged to be no-ops */
  dropped: number;
  /** number of oracle (derive) calls made */
  oracleCalls: number;
}

/**
 * Walk the history once. Keep an intervention iff applying it CHANGES the
 * semantic world; otherwise drop it. The decision is made entirely by `derive`
 * — this function contains no semantic rule of its own.
 *
 * Invariant: after processing H[0..k], the retained chain derives to the same
 * state as H[0..k] (we only drop a no-op).
 */
export function retainByStateChangeDetailed(canon: Canon, H: Intervention[]): RetainTrace {
  const retained: Intervention[] = [];
  let prev = derive(canon, retained).stateHash;
  let oracleCalls = 1;
  let dropped = 0;
  for (const iv of H) {
    retained.push(iv);
    const h = derive(canon, retained).stateHash;
    oracleCalls++;
    if (h === prev) {
      retained.pop();
      dropped++;
    } else {
      prev = h;
    }
  }
  return { retained, dropped, oracleCalls };
}

export function retainByStateChange(canon: Canon, H: Intervention[]): Intervention[] {
  return retainByStateChangeDetailed(canon, H).retained;
}

/* ------------------------------------------------------------------ */
/* M-A — greedy oracle minimization (stronger, slower)                 */
/* ------------------------------------------------------------------ */

/**
 * Repeatedly try to remove each intervention; keep the removal iff the world is
 * unchanged. Uses `derive` as the oracle. Slower than M-H but explores removals
 * M-H cannot (an intervention that changed the state at its time may still be
 * removable once later interventions supersede it).
 */
export function retainGreedy(canon: Canon, H: Intervention[]): Intervention[] {
  const target = derive(canon, H).stateHash;
  let R = [...H];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < R.length; i++) {
      const candidate = [...R.slice(0, i), ...R.slice(i + 1)];
      if (derive(canon, candidate).stateHash === target) {
        R = candidate;
        changed = true;
        break;
      }
    }
  }
  return R;
}

/* ------------------------------------------------------------------ */
/* equivalence check                                                   */
/* ------------------------------------------------------------------ */

export interface EquivResult {
  equal: boolean;
  semanticEqual: boolean;
  hashEqual: boolean;
  diffEmpty: boolean;
}

export function sameWorld(a: WorldState, b: WorldState): EquivResult {
  const semanticEqual = canonicalJson(effectiveSemanticState(a)) === canonicalJson(effectiveSemanticState(b));
  const hashEqual = a.stateHash === b.stateHash;
  const d = worldDiff(a, b);
  const diffEmpty =
    d.statusChanges.length === 0 &&
    d.factAdditions.length === 0 &&
    d.factRemovals.length === 0 &&
    d.factOverrides.length === 0 &&
    d.edgeChanges.length === 0 &&
    d.contradictionsIntroduced.length === 0 &&
    d.contradictionsResolved.length === 0 &&
    d.constraintViolationsIntroduced.length === 0 &&
    d.constraintViolationsResolved.length === 0 &&
    d.temporalViolationsIntroduced.length === 0 &&
    d.temporalViolationsResolved.length === 0 &&
    d.reachabilityChanges.length === 0 &&
    d.workStatusChanges.length === 0;
  return { equal: semanticEqual && hashEqual && diffEmpty, semanticEqual, hashEqual, diffEmpty };
}

export { DERIVED_ID_PREFIX };
