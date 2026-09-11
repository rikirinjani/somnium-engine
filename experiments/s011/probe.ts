/**
 * S011 — Phase 5/6: does foldStateDeltas catch the S009 and S010 witnesses?
 */
import { verrinCanon } from "../../src/canon/verrin";
import type { Canon } from "../../src/canon/types";
import { foldStateDeltas, derive } from "../../src/derive/world-state";
import { setFact, retractFact, forceEvent, negateEvent } from "../../src/timeline/types";

// --- S009 witness: overlap canon (two simultaneously-effective facts) ---
const F1 = "fact/x-at-loc1";
const F2 = "fact/x-at-loc2";
const overlap: Canon = {
  canonId: "canon/s011-overlap",
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

const s009 = [setFact("char/x", "at", "W1", "s"), retractFact(F2, "s"), setFact("char/x", "at", "W2", "s")];
console.log("=== S009 witness (overlap canon) ===");
for (const d of foldStateDeltas(overlap, s009)) {
  console.log(`  #${d.index} ${d.kind}:${d.target} components=[${d.components.join(", ")}] changed=${d.components.length > 0}`);
}

// --- S010 witness: seed canon verrin ---
const verrin = verrinCanon();
const s010 = [forceEvent("ev/maren-return", "s"), negateEvent("ev/maren-return", "s")];
console.log("\n=== S010 witness (verrin) ===");
for (const d of foldStateDeltas(verrin, s010)) {
  console.log(`  #${d.index} ${d.kind}:${d.target} components=[${d.components.join(", ")}] changed=${d.components.length > 0}`);
}

// Sanity: the S010 forceEvent is a semantic no-op but a fold-state change.
console.log("\nsemantic hashes:");
console.log("  []               =", derive(verrin, []).stateHash);
console.log("  [force]          =", derive(verrin, [s010[0]!]).stateHash);
console.log("  [force, negate]  =", derive(verrin, s010).stateHash);
console.log("  [negate]         =", derive(verrin, [s010[1]!]).stateHash);
