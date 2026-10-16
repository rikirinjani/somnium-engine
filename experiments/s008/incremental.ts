/**
 * S008 — Incremental derivation equivalence.
 *
 * QUESTION: can `step(prevWorldState, I)` extend a world by one intervention and
 * produce EXACTLY the same effective semantic world as `derive(canon, fullChain)`?
 *
 * ARCHITECTURAL RULE (S008 spec): do not create an independent semantic engine.
 * This module therefore contains NO semantic rules. It reuses `derive` verbatim
 * as the sole semantic authority. What it adds is a *chain reduction*: a
 * semantics-preserving re-encoding of the accumulated intervention history that
 * lets `derive` see a bounded chain instead of the whole history.
 *
 * WHY REDUCTION IS THE ONLY LEVER. Reading `derive` (src/derive/world-state.ts)
 * and `buildModel` (src/derive/propagation.ts) shows the cost splits in two:
 *   - O(model): propagation fixpoint, effective facts, work statuses, temporal,
 *     constraints, canonical representation, stateHash. Independent of H.
 *   - O(H): `buildModel`'s intervention fold, `applyFactInterventions`'s fold,
 *     and `canonicalInterventions` for identityHash.
 * So the only thing that makes the prefix walk O(H^2) is that each `derive` call
 * re-reads the entire chain. If the chain stays bounded, `derive` becomes
 * O(model) per call and the walk becomes O(H).
 *
 * THE REDUCTION IS A SUBSUMPTION, NOT A SEMANTIC RULE. It decides which earlier
 * interventions are *already implied* by later ones. The semantics of what those
 * interventions MEAN stay in `derive`. Every subsumption below is guarded so it
 * cannot change the model or the effective-fact list:
 *
 *   negateEvent(t) / forceEvent(t)   set-like accumulators -> keep LAST per target
 *   setFact/relocate (cell)          last-write-wins       -> keep LAST per cell
 *   retractFact(f)                   idempotent removal    -> keep FIRST per id
 *   severEdge/addEdge (edge id)      last-op-wins          -> keep LAST per edge id
 *
 * WHY RETRACT KEEPS THE *FIRST*, NOT THE LAST. `overrideFact` reuses the
 * replaced fact's id, so a write AFTER a retract mints a synthetic id. But once
 * a fact id has been retracted it can NEVER come back: a later write to its cell
 * finds no matching fact and mints `derived:<cell>`, so every later retract of
 * the same id is a no-op. Therefore the first retract is the one that matters.
 * Symmetrically, a write's effect is fully determined by the LAST write to its
 * cell (earlier writes only changed the value, which the last overwrites). These
 * two facts make the reduction exact, not merely conservative — verified
 * exhaustively by the differential-equivalence harness.
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
  relocate,
} from "../../src/timeline/types";
import { derive, type WorldState } from "../../src/derive/world-state";
import { cellKey } from "../../src/derive/propagation";
import { buildFactVocabulary, factAssertionError } from "../../src/canon/fact-rules";

/* ------------------------------------------------------------------ */
/* Cell helpers                                                        */
/* ------------------------------------------------------------------ */

/** The (subject, predicate) cell a fact id belongs to, or null if unknown. */
export function factCellKey(canon: Canon, factId: string): string | null {
  if (factId.startsWith(DERIVED_ID_PREFIX)) {
    const body = factId.slice(DERIVED_ID_PREFIX.length);
    try {
      const parsed = JSON.parse(body) as unknown;
      if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
        return cellKey(parsed[0], parsed[1]);
      }
    } catch {
      return null;
    }
    return null;
  }
  const fact = canon.facts.find((f) => f.id === factId);
  return fact === undefined ? null : cellKey(fact.subject, fact.predicate);
}

/** Every fact id that could occupy a cell: canon facts for it + the synthetic id. */
function cellFactIds(canon: Canon, cell: string): string[] {
  let subject: string | undefined;
  let predicate: string | undefined;
  try {
    const parsed = JSON.parse(cell) as unknown;
    if (Array.isArray(parsed) && parsed.length === 2) {
      subject = String(parsed[0]);
      predicate = String(parsed[1]);
    }
  } catch {
    return [];
  }
  if (subject === undefined || predicate === undefined) return [];
  const ids: string[] = [];
  for (const f of canon.facts) {
    if (f.subject === subject && f.predicate === predicate) ids.push(f.id);
  }
  ids.push(`${DERIVED_ID_PREFIX}${cell}`);
  return ids;
}

/** Extract the (predicate, value) a setFact/relocate writes. */
function writeOf(iv: Intervention): { predicate: string; value: string | number | boolean | null } | null {
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

/* ------------------------------------------------------------------ */
/* Reduction                                                           */
/* ------------------------------------------------------------------ */

export interface ReductionStats {
  before: number;
  after: number;
}

/**
 * Drop interventions that another one provably subsumes. Order-preserving:
 * surviving interventions keep their original relative order.
 *
 *   setFact/relocate  keep LAST per (subject, predicate) cell
 *   negateEvent       keep LAST per target
 *   forceEvent        keep LAST per target
 *   retractFact       keep FIRST per fact id  (see the header: an id never returns)
 *   severEdge/addEdge keep LAST per edge id
 */
export function reduceChain(canon: Canon, chain: Intervention[]): Intervention[] {
  const keep = new Array<boolean>(chain.length).fill(true);
  const vocab = buildFactVocabulary(canon);
  const lastCellWrite = new Map<string, number>(); // legal write -> keep LAST per cell
  const firstRejected = new Map<string, number>(); // rejected write -> keep FIRST per contra id
  const lastNegate = new Map<string, number>(); // target -> index (keep last)
  const lastForce = new Map<string, number>(); // target -> index (keep last)
  const firstRetract = new Map<string, number>(); // factId -> index (keep first)
  const lastEdgeOp = new Map<string, number>(); // edgeId -> index (keep last)

  for (let i = 0; i < chain.length; i++) {
    const iv = chain[i]!;
    if (iv.kind === "setFact" || iv.kind === "relocate") {
      const w = writeOf(iv);
      if (w === null) continue;
      const error = factAssertionError(iv.target, w.predicate, w.value, vocab);
      if (error !== null) {
        // A REJECTED write never touches `overriddenCells`; it contributes a
        // contradiction instead. That record's id is
        //   contra:<subject>:fact-write-illegal:<reason>
        // which does NOT include the written value — so `detectContradictions`
        // keeps the FIRST such write per id. Dropping the first (as a naive
        // last-write-wins rule did) changes the record's `b`/`detail`. Keep the
        // first per contradiction id, exactly mirroring the renderer.
        const cid = `contra:${iv.target}:fact-write-illegal:${error.reason}`;
        if (firstRejected.has(cid)) keep[i] = false;
        else firstRejected.set(cid, i);
      } else {
        const cell = cellKey(iv.target, w.predicate);
        const prev = lastCellWrite.get(cell);
        if (prev !== undefined) keep[prev] = false;
        lastCellWrite.set(cell, i);
      }
    } else if (iv.kind === "retractFact") {
      const prev = firstRetract.get(iv.target);
      if (prev === undefined) firstRetract.set(iv.target, i);
      else keep[i] = false; // later retract of the same id is always a no-op
    } else if (iv.kind === "negateEvent") {
      const prev = lastNegate.get(iv.target);
      if (prev !== undefined) keep[prev] = false;
      lastNegate.set(iv.target, i);
    } else if (iv.kind === "forceEvent") {
      const prev = lastForce.get(iv.target);
      if (prev !== undefined) keep[prev] = false;
      lastForce.set(iv.target, i);
    } else if (iv.kind === "severEdge" || iv.kind === "addEdge") {
      const edgeId =
        iv.kind === "severEdge" ? iv.target : ((iv.params?.edge as CausalEdge | undefined)?.id ?? null);
      if (typeof edgeId === "string") {
        const prev = lastEdgeOp.get(edgeId);
        if (prev !== undefined) keep[prev] = false;
        lastEdgeOp.set(edgeId, i);
      }
    }
  }
  return chain.filter((_, i) => keep[i]!);
}

/* ------------------------------------------------------------------ */
/* step / incrementalDerive                                            */
/* ------------------------------------------------------------------ */

export interface IncrementalState {
  /** The accumulated, reduced chain (the only carried state). */
  chain: Intervention[];
  /** The world after the last step (== derive(canon, chain)). */
  world: WorldState;
}

/** W0 = derive(canon, []) */
export function initialState(canon: Canon): IncrementalState {
  return { chain: [], world: derive(canon, []) };
}

/**
 * W_{k} = step(W_{k-1}, I).
 *
 * The carried state is the reduced chain. The step appends the new intervention,
 * reduces, and re-derives — reusing `derive` as the semantic oracle. Cost is
 * O(model + |reduced chain|) per step; the reduced chain is bounded by the model
 * for histories whose order-dependent interactions stay bounded.
 */
export function step(canon: Canon, prev: IncrementalState, iv: Intervention): IncrementalState {
  const chain = reduceChain(canon, [...prev.chain, iv]);
  return { chain, world: derive(canon, chain) };
}

/** Fold a whole history through `step`. */
export function incrementalDerive(canon: Canon, history: Intervention[]): WorldState {
  let state = initialState(canon);
  for (const iv of history) state = step(canon, state, iv);
  return state.world;
}

/** Like `incrementalDerive` but also returns the final reduced chain. */
export function incrementalDeriveWithChain(
  canon: Canon,
  history: Intervention[]
): { world: WorldState; chain: Intervention[] } {
  let state = initialState(canon);
  for (const iv of history) state = step(canon, state, iv);
  return { world: state.world, chain: state.chain };
}
