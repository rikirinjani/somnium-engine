/**
 * S009 — synthetic canon with OVERLAPPING validity windows.
 *
 * The seed canons use disjoint windows (at most one fact per cell effective at
 * any time), which is why the R1 multi-fact attack does not fire on them. But
 * `overrideFact` (world-state.ts:181) explicitly handles MULTIPLE matching
 * facts, and `isEffective` is a pure predicate — so the engine supports a cell
 * holding two simultaneously-effective facts. This canon is that case.
 *
 *   f1: char/x at loc/1   validFrom null   validTo ev/b
 *   f2: char/x at loc/2   validFrom ev/a   validTo null
 *
 * With ev/a occurring and ev/b not occurring, BOTH f1 and f2 are effective.
 */
import type { Canon } from "../../src/canon/types";
import { derive, type WorldState } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
import { forceEvent, setFact, retractFact, negateEvent } from "../../src/timeline/types";
import { reduceChain } from "./reduction";
import { isEmptyDiff } from "./counterexamples";

export const F1 = "fact/x-at-loc1";
export const F2 = "fact/x-at-loc2";

export function syntheticOverlapCanon(): Canon {
  return {
    canonId: "canon/s009-overlap",
    version: "1.0.0",
    entities: [
      { id: "ev/a", kind: "Event", name: "A" },
      { id: "ev/b", kind: "Event", name: "B" },
      { id: "char/x", kind: "Character", name: "X" },
      { id: "loc/1", kind: "Location", name: "One" },
      { id: "loc/2", kind: "Location", name: "Two" },
    ],
    facts: [
      { id: F1, subject: "char/x", predicate: "at", object: "loc/1", validFrom: null, validTo: "ev/b", source: "canon" },
      { id: F2, subject: "char/x", predicate: "at", object: "loc/2", validFrom: "ev/a", validTo: null, source: "canon" },
    ],
    edges: [],
    workBindings: [],
    hash: "",
  };
}

export interface OverlapResult {
  bothEffective: boolean;
  effectiveFactIds: string[];
  history: string[];
  reducedHistory: string[];
  legacyHash: string;
  reducedHash: string;
  legacyEffectiveFacts: string[];
  reducedEffectiveFacts: string[];
  semanticEqual: boolean;
  hashEqual: boolean;
  diffEmpty: boolean;
  counterexample: boolean;
}

export function runOverlapCounterexample(): OverlapResult {
  const canon = syntheticOverlapCanon();

  // Confirm both facts can be effective at once: ev/a occurs (it is a declared
  // root), ev/b is NEGATED so it does not occur. Then f1 (validTo ev/b) and f2
  // (validFrom ev/a) are BOTH effective — the overlapping-window case.
  const bothActive = derive(canon, [negateEvent("ev/b", "s009")]);
  const effectiveFactIds = bothActive.facts.filter((f) => f.predicate === "at").map((f) => f.id).sort();
  const bothEffective = effectiveFactIds.includes(F1) && effectiveFactIds.includes(F2);

  // The attack: make both effective, write, retract the fact the write reused, write.
  const history = [
    negateEvent("ev/b", "s009"),
    setFact("char/x", "at", "W1", "s009"),
    retractFact(F2, "s009"),
    setFact("char/x", "at", "W2", "s009"),
  ];
  const reduced = reduceChain(canon, history);

  const legacy = derive(canon, history);
  const red = derive(canon, reduced);

  const legacyEffectiveFacts = legacy.facts.filter((f) => f.subject === "char/x" && f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort();
  const reducedEffectiveFacts = red.facts.filter((f) => f.subject === "char/x" && f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort();

  const semanticEqual =
    canonicalJson(effectiveSemanticState(legacy)) === canonicalJson(effectiveSemanticState(red));
  const hashEqual = legacy.stateHash === red.stateHash;
  const diffEmpty = isEmptyDiff(worldDiff(legacy, red));

  return {
    bothEffective,
    effectiveFactIds,
    history: history.map((i) => `${i.kind}:${i.target}`),
    reducedHistory: reduced.map((i) => `${i.kind}:${i.target}`),
    legacyHash: legacy.stateHash,
    reducedHash: red.stateHash,
    legacyEffectiveFacts,
    reducedEffectiveFacts,
    semanticEqual,
    hashEqual,
    diffEmpty,
    counterexample: !(semanticEqual && hashEqual && diffEmpty),
  };
}

/** Same attack, but with the multi-fact guard enabled (the candidate fix). */
export function runOverlapCounterexampleGuarded(): OverlapResult {
  const canon = syntheticOverlapCanon();
  const history = [
    negateEvent("ev/b", "s009"),
    setFact("char/x", "at", "W1", "s009"),
    retractFact(F2, "s009"),
    setFact("char/x", "at", "W2", "s009"),
  ];
  const reduced = reduceChain(canon, history, { multiFactGuard: true });
  const legacy = derive(canon, history);
  const red = derive(canon, reduced);
  const semanticEqual =
    canonicalJson(effectiveSemanticState(legacy)) === canonicalJson(effectiveSemanticState(red));
  const hashEqual = legacy.stateHash === red.stateHash;
  const diffEmpty = isEmptyDiff(worldDiff(legacy, red));
  return {
    bothEffective: true,
    effectiveFactIds: [],
    history: history.map((i) => `${i.kind}:${i.target}`),
    reducedHistory: reduced.map((i) => `${i.kind}:${i.target}`),
    legacyHash: legacy.stateHash,
    reducedHash: red.stateHash,
    legacyEffectiveFacts: legacy.facts.filter((f) => f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort(),
    reducedEffectiveFacts: red.facts.filter((f) => f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort(),
    semanticEqual,
    hashEqual,
    diffEmpty,
    counterexample: !(semanticEqual && hashEqual && diffEmpty),
  };
}
