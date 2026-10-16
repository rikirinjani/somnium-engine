/**
 * S009 — run the overlap counterexample + the guarded variant.
 */
import { runOverlapCounterexample, runOverlapCounterexampleGuarded } from "./synthetic";

const r = runOverlapCounterexample();
console.log("=== OVERLAP COUNTEREXAMPLE (S008 rule) ===");
console.log("both facts simultaneously effective:", r.bothEffective);
console.log("effective fact ids after force:", JSON.stringify(r.effectiveFactIds));
console.log("history       :", r.history.join(" -> "));
console.log("reduced       :", r.reducedHistory.join(" -> "));
console.log("legacy facts  :", JSON.stringify(r.legacyEffectiveFacts));
console.log("reduced facts :", JSON.stringify(r.reducedEffectiveFacts));
console.log("legacy hash   :", r.legacyHash);
console.log("reduced hash  :", r.reducedHash);
console.log("semanticEqual :", r.semanticEqual);
console.log("hashEqual     :", r.hashEqual);
console.log("diffEmpty     :", r.diffEmpty);
console.log("COUNTEREXAMPLE:", r.counterexample);

const g = runOverlapCounterexampleGuarded();
console.log("\n=== OVERLAP (multi-fact guard ON) ===");
console.log("history       :", g.history.join(" -> "));
console.log("reduced       :", g.reducedHistory.join(" -> "));
console.log("legacy facts  :", JSON.stringify(g.legacyEffectiveFacts));
console.log("reduced facts :", JSON.stringify(g.reducedEffectiveFacts));
console.log("semanticEqual :", g.semanticEqual);
console.log("hashEqual     :", g.hashEqual);
console.log("diffEmpty     :", g.diffEmpty);
console.log("COUNTEREXAMPLE:", g.counterexample);
