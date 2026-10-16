/**
 * S010 — Phase 4: reproduce the S009 counterexample and test both retention
 * mechanisms against it.
 *
 * Canon (S009's `canon/s009-overlap-baked`): cell (char/x, at) holds TWO
 * simultaneously-effective facts (overlapping validity windows). ev/a is a root
 * (occurs); ev/b is in a REQUIRES 2-cycle and is unfounded (does not occur).
 */
import type { Canon } from "../../src/canon/types";
import { inspectCanon } from "../../src/canon/canon";
import { derive } from "../../src/derive/world-state";
import { setFact, retractFact, negateEvent } from "../../src/timeline/types";
import { retainFromAccumulators, retainByStateChange, sameWorld } from "./retain";

export const F1 = "fact/x-at-loc1";
export const F2 = "fact/x-at-loc2";

export function overlapCanon(): Canon {
  return {
    canonId: "canon/s010-overlap",
    version: "1.0.0",
    entities: [
      { id: "ev/a", kind: "Event", name: "A" },
      { id: "ev/b", kind: "Event", name: "B" },
      { id: "ev/c", kind: "Event", name: "C" },
      { id: "char/x", kind: "Character", name: "X" },
      { id: "loc/1", kind: "Location", name: "One" },
      { id: "loc/2", kind: "Location", name: "Two" },
    ],
    facts: [
      { id: F1, subject: "char/x", predicate: "at", object: "loc/1", validFrom: null, validTo: "ev/b", source: "canon" },
      { id: F2, subject: "char/x", predicate: "at", object: "loc/2", validFrom: "ev/a", validTo: null, source: "canon" },
    ],
    edges: [
      { id: "edge/b-requires-c", kind: "REQUIRES", from: "ev/c", to: "ev/b" },
      { id: "edge/c-requires-b", kind: "REQUIRES", from: "ev/b", to: "ev/c" },
    ],
    workBindings: [],
    hash: "",
  };
}

export interface CexResult {
  canonValid: boolean;
  canonErrors: unknown;
  bothEffective: boolean;
  history: string[];
  baselineHash: string;
  legacyHash: string;
  legacyFacts: string[];
  mechanisms: {
    name: string;
    retained: string[];
    retainedLen: number;
    semanticEqual: boolean;
    hashEqual: boolean;
    diffEmpty: boolean;
    retainedFacts: string[];
  }[];
}

export function runCounterexample(): CexResult {
  const canon = overlapCanon();
  const inspection = inspectCanon(canon);
  const base = derive(canon, []);
  const baseAt = base.facts.filter((f) => f.predicate === "at").map((f) => f.id).sort();

  const history = [setFact("char/x", "at", "W1", "s010"), retractFact(F2, "s010"), setFact("char/x", "at", "W2", "s010")];
  const legacy = derive(canon, history);

  const mechs = [
    { name: "M-B accumulator-only", retained: retainFromAccumulators(canon, history) },
    { name: "M-H oracle state-change", retained: retainByStateChange(canon, history) },
  ].map(({ name, retained }) => {
    const ws = derive(canon, retained);
    const eq = sameWorld(legacy, ws);
    return {
      name,
      retained: retained.map((i) => `${i.kind}:${i.target}`),
      retainedLen: retained.length,
      semanticEqual: eq.semanticEqual,
      hashEqual: eq.hashEqual,
      diffEmpty: eq.diffEmpty,
      retainedFacts: ws.facts.filter((f) => f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort(),
    };
  });

  return {
    canonValid: (inspection as { errors: unknown[] }).errors.length === 0,
    canonErrors: (inspection as { errors: unknown[] }).errors,
    bothEffective: baseAt.includes(F1) && baseAt.includes(F2),
    history: history.map((i) => `${i.kind}:${i.target}`),
    baselineHash: base.stateHash,
    legacyHash: legacy.stateHash,
    legacyFacts: legacy.facts.filter((f) => f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort(),
    mechanisms: mechs,
  };
}

void negateEvent;
