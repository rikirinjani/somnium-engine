/**
 * S009 — legitimacy + minimization of the R1 counterexample.
 *
 * Legitimacy: is the overlapping-window canon a VALID canon (accepted by
 * inspectCanon), not an artifact?
 *
 * Minimization: can the history be reduced below 4 interventions? The overlap
 * can be baked into the canon (a bootstrap cycle makes ev/b non-occurring), so
 * only the 3 write/retract operations are needed.
 */
import { inspectCanon } from "../../src/canon/canon";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
import { setFact, retractFact } from "../../src/timeline/types";
import { reduceChain } from "./reduction";
import { isEmptyDiff } from "./counterexamples";
import { syntheticOverlapCanon, F1, F2 } from "./synthetic";

/* ---- legitimacy ---- */
const canon = syntheticOverlapCanon();
const inspection = inspectCanon(canon);
console.log("=== legitimacy: inspectCanon(syntheticOverlapCanon) ===");
console.log(JSON.stringify(inspection, null, 2).slice(0, 800));

/* ---- minimization: bake the overlap into the canon ---- */
function bakedCanon(): Canon {
  const c = syntheticOverlapCanon();
  // ev/b must NOT occur. A 2-cycle ev/b <-> ev/c with no external ground is a
  // bootstrap cycle: well-founded semantics make both NEITHER (not occurring).
  return {
    ...c,
    canonId: "canon/s009-overlap-baked",
    entities: [...c.entities, { id: "ev/c", kind: "Event", name: "C" }],
    edges: [
      { id: "edge/b-requires-c", kind: "REQUIRES", from: "ev/c", to: "ev/b" },
      { id: "edge/c-requires-b", kind: "REQUIRES", from: "ev/b", to: "ev/c" },
    ],
  };
}

const baked = bakedCanon();
console.log("\n=== legitimacy: inspectCanon(bakedCanon) ===");
const bi = inspectCanon(baked);
console.log(JSON.stringify(bi, null, 2).slice(0, 800));

const base = derive(baked, []);
const baseAt = base.facts.filter((f) => f.predicate === "at").map((f) => f.id).sort();
console.log("\nbaseline effective `at` facts:", JSON.stringify(baseAt));
console.log("both effective at baseline:", baseAt.includes(F1) && baseAt.includes(F2));

// 3-intervention minimal history.
const history = [setFact("char/x", "at", "W1", "s009"), retractFact(F2, "s009"), setFact("char/x", "at", "W2", "s009")];
const reduced = reduceChain(baked, history);
const legacy = derive(baked, history);
const red = derive(baked, reduced);

console.log("\n=== MINIMAL COUNTEREXAMPLE (3 interventions) ===");
console.log("history  :", history.map((i) => `${i.kind}:${i.target}`).join(" -> "));
console.log("reduced  :", reduced.map((i) => `${i.kind}:${i.target}`).join(" -> "));
console.log(
  "legacy at:",
  JSON.stringify(legacy.facts.filter((f) => f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort())
);
console.log(
  "reduced at:",
  JSON.stringify(red.facts.filter((f) => f.predicate === "at").map((f) => `${f.id}=${String(f.object)}`).sort())
);
const semanticEqual = canonicalJson(effectiveSemanticState(legacy)) === canonicalJson(effectiveSemanticState(red));
console.log("legacy hash :", legacy.stateHash);
console.log("reduced hash:", red.stateHash);
console.log("semanticEqual:", semanticEqual, "hashEqual:", legacy.stateHash === red.stateHash, "diffEmpty:", isEmptyDiff(worldDiff(legacy, red)));
console.log("COUNTEREXAMPLE:", !(semanticEqual && legacy.stateHash === red.stateHash && isEmptyDiff(worldDiff(legacy, red))));
