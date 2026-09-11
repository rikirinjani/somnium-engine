/**
 * S012 — Phase 2/3: forcedBy identity investigation.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import { buildModel } from "../../src/derive/propagation";
import { derive, foldStateDeltas } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { type Intervention, forceEvent, negateEvent, retractFact } from "../../src/timeline/types";

const verrin = verrinCanon();
const E = "ev/maren-return";

function show(label: string, H: Intervention[]): void {
  const model = buildModel(verrin, H);
  const fb = [...model.forcedBy.entries()];
  const deltas = foldStateDeltas(verrin, H);
  const ws = derive(verrin, H);
  const fbSemantic = ws.contradictions.map((c) => c.id).sort();
  console.log(`${label}`);
  console.log(`   forcedBy=[${fb.map(([k, v]) => `${k}=>${v}`).join(", ")}]`);
  console.log(`   deltas=[${deltas.map((d) => `${d.kind}:${d.components.join("|") || "-"}`).join(", ")}]`);
  console.log(`   stateHash=${ws.stateHash} contradictions=[${fbSemantic.join(", ")}]`);
}

console.log("=== forcedBy identity: stored value ===");
show("FORCE", [forceEvent(E, "s")]);
show("FORCE -> FORCE", [forceEvent(E, "s"), forceEvent(E, "s")]);
show("FORCE -> NEGATE", [forceEvent(E, "s"), negateEvent(E, "s")]);
show("NEGATE -> FORCE", [negateEvent(E, "s"), forceEvent(E, "s")]);
show("FORCE -> RETRACT(unrelated)", [forceEvent(E, "s"), retractFact(verrin.facts[0]!.id, "s")]);
show("FORCE -> semantic no-op -> NEGATE", [forceEvent(E, "s"), forceEvent(E, "s"), negateEvent(E, "s")]);

console.log("\n=== does the forcedBy VALUE affect the semantic state? ===");
// A hand-built forceEvent with a DIFFERENT id but the same target.
const custom: Intervention = { id: "forceEvent:custom-xyz", kind: "forceEvent", target: E, label: "custom" };
const a = derive(verrin, [forceEvent(E, "s")]);
const b = derive(verrin, [custom]);
console.log("constructor id   :", forceEvent(E).id);
console.log("custom id        :", custom.id);
console.log("same stateHash   :", a.stateHash === b.stateHash, `(${a.stateHash} vs ${b.stateHash})`);
console.log("same semanticState:", canonicalJson(effectiveSemanticState(a)) === canonicalJson(effectiveSemanticState(b)));
console.log(
  "contradiction sources:",
  JSON.stringify(a.contradictions.map((c) => c.source)),
  JSON.stringify(b.contradictions.map((c) => c.source))
);

console.log("\n=== value is a function of the key? ===");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const evs = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort().slice(0, 5);
  const model = buildModel(canon, evs.map((e) => forceEvent(e, "s")));
  const allMatch = [...model.forcedBy.entries()].every(([k, v]) => v === `forceEvent:${k}`);
  console.log(`   ${name}: every forcedBy value === 'forceEvent:<key>'? ${allMatch}`);
}
