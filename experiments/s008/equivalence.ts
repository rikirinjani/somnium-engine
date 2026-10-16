/**
 * S008 — differential equivalence harness.
 *
 * For each history:
 *   legacy      = derive(canon, history)            (the reference oracle)
 *   incremental = incrementalDerive(canon, history) (step-folded)
 *
 * Required invariant (S008 Phase 4):
 *   semanticState(legacy) === semanticState(incremental)
 *   stateHash(legacy)      === stateHash(incremental)
 *   worldDiff(legacy, incremental) === empty
 *
 * Lineage is NOT compared: `identityHash` and `WorldState.interventions` are
 * provenance, and the incremental path deliberately carries a reduced chain.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon, ORDOS_IDS } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive, type WorldState } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
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
import { incrementalDerive, incrementalDeriveWithChain, reduceChain } from "./incremental";

export interface EquivalenceResult {
  name: string;
  canon: string;
  historyLen: number;
  reducedLen: number;
  semanticEqual: boolean;
  hashEqual: boolean;
  diffEmpty: boolean;
  legacyHash: string;
  incrementalHash: string;
  legacyThrew: boolean;
  incrementalThrew: boolean;
  throwEqual: boolean;
  ok: boolean;
  note?: string;
}

export function isEmptyDiff(d: ReturnType<typeof worldDiff>): boolean {
  return (
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
    d.workStatusChanges.length === 0
  );
}

function tryDerive(fn: () => WorldState): { world: WorldState | null; threw: boolean; error?: string } {
  try {
    return { world: fn(), threw: false };
  } catch (err) {
    return { world: null, threw: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Compare one history. */
export function checkHistory(canon: Canon, canonName: string, name: string, history: Intervention[]): EquivalenceResult {
  const legacy = tryDerive(() => derive(canon, history));
  const inc = tryDerive(() => incrementalDerive(canon, history));

  const reduced = reduceChain(canon, history);

  // Throw behaviour must match (S008 Phase 6).
  const throwEqual = legacy.threw === inc.threw;

  if (legacy.threw || inc.threw) {
    return {
      name,
      canon: canonName,
      historyLen: history.length,
      reducedLen: reduced.length,
      semanticEqual: false,
      hashEqual: false,
      diffEmpty: false,
      legacyHash: "",
      incrementalHash: "",
      legacyThrew: legacy.threw,
      incrementalThrew: inc.threw,
      throwEqual,
      ok: throwEqual,
      note: `legacy=${legacy.error ?? "ok"} incremental=${inc.error ?? "ok"}`,
    };
  }

  const a = legacy.world!;
  const b = inc.world!;
  const semanticEqual =
    canonicalJson(effectiveSemanticState(a)) === canonicalJson(effectiveSemanticState(b));
  const hashEqual = a.stateHash === b.stateHash;
  const diffEmpty = isEmptyDiff(worldDiff(a, b));

  return {
    name,
    canon: canonName,
    historyLen: history.length,
    reducedLen: reduced.length,
    semanticEqual,
    hashEqual,
    diffEmpty,
    legacyHash: a.stateHash,
    incrementalHash: b.stateHash,
    legacyThrew: false,
    incrementalThrew: false,
    throwEqual: true,
    ok: semanticEqual && hashEqual && diffEmpty,
  };
}

/* ------------------------------------------------------------------ */
/* History battery                                                     */
/* ------------------------------------------------------------------ */

export interface NamedHistory {
  name: string;
  history: Intervention[];
}

/** Deterministic RNG (mulberry32) so histories reproduce exactly. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Constructed histories covering the S008 Phase 5 matrix. */
export function constructedHistories(canon: Canon): NamedHistory[] {
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const H: NamedHistory[] = [];
  const e0 = evs[0]!;
  const e1 = evs[1] ?? evs[0]!;
  const s0 = ents[0]!;
  const s1 = ents[1] ?? ents[0]!;
  const f0 = facts[0]!;

  H.push({ name: "empty", history: [] });
  H.push({ name: "one:negateEvent", history: [negateEvent(e0, "x")] });
  H.push({ name: "one:forceEvent", history: [forceEvent(e0, "x")] });
  H.push({ name: "one:setFact(cell)", history: [setFact(s0, f0.predicate, f0.object, "x")] });
  H.push({ name: "one:setFact(newcell)", history: [setFact(s0, "s008_new", true, "x")] });
  H.push({ name: "one:retractFact", history: [retractFact(f0.id, "x")] });
  H.push({ name: "one:severEdge", history: [severEdge(edges[0]!.id, "x")] });
  H.push({ name: "one:addEdge", history: [addEdge({ ...edges[0]! }, "x")] });
  H.push({ name: "one:relocate", history: [relocate(s0, s1, "x")] });

  // repeated identical
  H.push({ name: "repeat:negate x5", history: Array.from({ length: 5 }, () => negateEvent(e0, "x")) });
  H.push({ name: "repeat:force x5", history: Array.from({ length: 5 }, () => forceEvent(e0, "x")) });
  H.push({ name: "repeat:retract x5", history: Array.from({ length: 5 }, () => retractFact(f0.id, "x")) });
  H.push({
    name: "repeat:same-cell-write x5",
    history: Array.from({ length: 5 }, () => setFact(s0, f0.predicate, f0.object, "x")),
  });

  // negation / conflict
  H.push({ name: "negate-then-force", history: [negateEvent(e0, "x"), forceEvent(e0, "x")] });
  H.push({ name: "force-then-negate", history: [forceEvent(e0, "x"), negateEvent(e0, "x")] });

  // independent writes (commuting)
  H.push({
    name: "independent-writes-ab",
    history: [setFact(s0, "s008_a", 1, "x"), setFact(s1, "s008_b", 2, "x")],
  });
  H.push({
    name: "independent-writes-ba",
    history: [setFact(s1, "s008_b", 2, "x"), setFact(s0, "s008_a", 1, "x")],
  });

  // sequential writes to the same cell (order matters)
  H.push({
    name: "same-cell-writes",
    history: [
      setFact(s0, f0.predicate, f0.object, "x"),
      setFact(s0, f0.predicate, "CHANGED", "x"),
      setFact(s0, f0.predicate, f0.object, "x"),
    ],
  });

  // retract/write interaction on the SAME cell (the order-dependent id case)
  H.push({ name: "retract-then-write", history: [retractFact(f0.id, "x"), setFact(s0, f0.predicate, "V", "x")] });
  H.push({ name: "write-then-retract", history: [setFact(s0, f0.predicate, "V", "x"), retractFact(f0.id, "x")] });
  H.push({
    name: "write-retract-write",
    history: [setFact(s0, f0.predicate, "V1", "x"), retractFact(f0.id, "x"), setFact(s0, f0.predicate, "V2", "x")],
  });
  H.push({
    name: "retract-write-retract",
    history: [retractFact(f0.id, "x"), setFact(s0, f0.predicate, "V", "x"), retractFact(f0.id, "x")],
  });

  // edges: order matters
  if (edges.length >= 1) {
    H.push({
      name: "sever-then-add-same-edge",
      history: [severEdge(edges[0]!.id, "x"), addEdge({ ...edges[0]! }, "x")],
    });
    H.push({
      name: "add-then-sever-same-edge",
      history: [addEdge({ ...edges[0]! }, "x"), severEdge(edges[0]!.id, "x")],
    });
  }

  // convergence patterns (S007-proven): different lengths, same state
  H.push({
    name: "converge:redundant-1",
    history: [setFact(s0, f0.predicate, f0.object, "x")],
  });
  H.push({
    name: "converge:redundant-8",
    history: Array.from({ length: 8 }, () => setFact(s0, f0.predicate, f0.object, "x")),
  });

  // mixed realistic chain
  H.push({
    name: "mixed-chain",
    history: [
      negateEvent(e0, "x"),
      setFact(s0, f0.predicate, "M1", "x"),
      forceEvent(e1, "x"),
      severEdge(edges[0]!.id, "x"),
      setFact(s0, f0.predicate, "M2", "x"),
      retractFact(f0.id, "x"),
      addEdge({ ...edges[0]! }, "x"),
      setFact(s1, "s008_mixed", 3, "x"),
    ],
  });

  return H;
}

/** Random histories for scale testing. */
export function randomHistories(canon: Canon, count: number, horizon: number, seed: number): NamedHistory[] {
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const preds = [...new Set(canon.facts.map((f) => f.predicate))].sort();
  const objs = [...new Set(canon.facts.map((f) => f.object))];
  const factIds = canon.facts.map((f) => f.id).sort();
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const out: NamedHistory[] = [];
  const rand = rng(seed);

  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

  for (let c = 0; c < count; c++) {
    const history: Intervention[] = [];
    for (let k = 0; k < horizon; k++) {
      const roll = rand();
      if (roll < 0.4 && ents.length > 0 && preds.length > 0) {
        history.push(setFact(pick(ents), pick(preds), objs.length > 0 ? pick(objs) : true, "r"));
      } else if (roll < 0.55 && evs.length > 0) {
        history.push(negateEvent(pick(evs), "r"));
      } else if (roll < 0.7 && evs.length > 0) {
        history.push(forceEvent(pick(evs), "r"));
      } else if (roll < 0.82 && factIds.length > 0) {
        history.push(retractFact(pick(factIds), "r"));
      } else if (roll < 0.92 && edges.length > 0) {
        history.push(severEdge(pick(edges).id, "r"));
      } else if (edges.length > 0) {
        history.push(addEdge({ ...pick(edges) }, "r"));
      } else if (ents.length > 0 && preds.length > 0) {
        history.push(setFact(pick(ents), pick(preds), true, "r"));
      }
    }
    out.push({ name: `random-${c}-H${horizon}`, history });
  }
  return out;
}

/** Run a set of histories against one canon. */
export function runEquivalence(canon: Canon, canonName: string, histories: NamedHistory[]): EquivalenceResult[] {
  return histories.map((h) => checkHistory(canon, canonName, h.name, h.history));
}

export function summarize(results: EquivalenceResult[]): {
  total: number;
  passed: number;
  failed: EquivalenceResult[];
} {
  const failed = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - failed.length, failed };
}
