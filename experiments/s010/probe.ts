import { runCounterexample } from "./synthetic";

const r = runCounterexample();
console.log("=== S010 Phase 4: S009 counterexample reproduction ===");
console.log("canon valid (inspectCanon errors empty):", r.canonValid, JSON.stringify(r.canonErrors));
console.log("both facts effective at baseline:", r.bothEffective);
console.log("history:", r.history.join(" -> "));
console.log("legacy hash:", r.legacyHash);
console.log("legacy facts:", JSON.stringify(r.legacyFacts));
console.log("");
for (const m of r.mechanisms) {
  console.log(`-- ${m.name}`);
  console.log(`   retained (${m.retainedLen}):`, m.retained.join(" -> ") || "(empty)");
  console.log(`   facts:`, JSON.stringify(m.retainedFacts));
  console.log(`   semanticEqual=${m.semanticEqual} hashEqual=${m.hashEqual} diffEmpty=${m.diffEmpty}`);
}
