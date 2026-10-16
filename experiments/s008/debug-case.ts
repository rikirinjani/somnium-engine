/**
 * S008 — reproduce the write+retract+write divergence.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { setFact, retractFact } from "../../src/timeline/types";
import { reduceChain, incrementalDerive } from "./incremental";

const canon = verrinCanon();
const f = canon.facts.find((x) => x.id === "fact/kael-oath-is-oath")!;
console.log("fact:", JSON.stringify(f));

const history = [
  setFact(f.subject, f.predicate, "V1", "m"),
  retractFact(f.id, "m"),
  setFact(f.subject, f.predicate, "V2", "m"),
];
const reduced = reduceChain(canon, history);
console.log("history:", history.map((i) => i.kind + ":" + i.target));
console.log("reduced:", reduced.map((i) => i.kind + ":" + i.target));

const legacy = derive(canon, history);
const inc = incrementalDerive(canon, history);
console.log("legacy stateHash:", legacy.stateHash);
console.log("inc    stateHash:", inc.stateHash);
console.log("equal:", legacy.stateHash === inc.stateHash);

const ra = effectiveSemanticState(legacy);
const rb = effectiveSemanticState(inc);
for (const dim of Object.keys(ra)) {
  const a = canonicalJson(ra[dim]);
  const b = canonicalJson(rb[dim]);
  if (a !== b) {
    console.log(`\nDIMENSION ${dim} differs:`);
    console.log("  legacy:", a);
    console.log("  inc   :", b);
  }
}

console.log("\nlegacy facts:", JSON.stringify(legacy.facts));
console.log("inc    facts:", JSON.stringify(inc.facts));
console.log("legacy overridden-relevant contradictions:", JSON.stringify(legacy.contradictions));
console.log("inc    contradictions:", JSON.stringify(inc.contradictions));
