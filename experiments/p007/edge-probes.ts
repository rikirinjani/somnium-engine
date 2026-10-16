/**
 * Somnium Engine — P-007 edge/identity boundary probes.
 *
 * The resume brief's critical question:
 *
 *   > If causal law itself is part of effective world state, can WorldDiff
 *   > faithfully explain a change in the world's causal structure even when the
 *   > currently observed facts have not changed?
 *
 * And the prior one it depends on: do ALL edges belong in effective world
 * identity, or only semantically active ones? These probes construct the ten
 * cases from §5 of the brief plus the ALTERED and convergence cases, and print
 * what the engine actually does. Nothing here asserts; it measures.
 *
 * Run: npx tsx experiments/p007/edge-probes.ts
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon, ORDOS_IDS as O } from "../../src/canon/ordos";
import { derive } from "../../src/derive/world-state";
import type { WorldState } from "../../src/derive/world-state";
import { worldDiff } from "../../src/diff/diff";
import type { WorldDiff } from "../../src/diff/types";
import { addEdge, forceEvent, negateEvent, relocate, setFact, severEdge } from "../../src/timeline/types";
import type { Intervention } from "../../src/timeline/types";
import type { CausalEdge } from "../../src/canon/types";
import { hashCanon } from "../../src/canon/hash";

const v = verrinCanon();
const base = derive(v, []);

function empty(d: WorldDiff): boolean {
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

function line(label: string, a: WorldState, b: WorldState): void {
  const d = worldDiff(a, b);
  console.log(
    `${label.padEnd(46)} stateHashΔ=${String(a.stateHash !== b.stateHash).padEnd(5)} ` +
      `identityΔ=${String(a.identityHash !== b.identityHash).padEnd(5)} ` +
      `diffEmpty=${String(empty(d)).padEnd(5)} ` +
      `[status=${d.statusChanges.length} edge=${d.edgeChanges.length} fact=${d.factAdditions.length}/${d.factRemovals.length}/${d.factOverrides.length} ` +
      `work=${d.workStatusChanges.length} reach=${d.reachabilityChanges.length} temporal=${d.temporalViolationsIntroduced.length}/${d.temporalViolationsResolved.length}] ` +
      `INV_ok=${empty(d) === (a.stateHash === b.stateHash)}`
  );
}

const requiresOath = v.edges.find((e) => e.id === "edge/kael-oath-requires-blight") as CausalEdge;
const motivatesOath = v.edges.find((e) => e.id === "edge/blight-motivates-oath") as CausalEdge;
const enablesVow = v.edges.find((e) => e.id === "edge/defiance-enables-vow") as CausalEdge;
const precedesOath = v.edges.find((e) => e.id === "edge/blight-before-oath") as CausalEdge;
const excludesSiege = v.edges.find((e) => e.id === "edge/wardens-exclude-siege") as CausalEdge;
const invariantBetrayal = v.edges.find((e) => e.id === "edge/oath-forbids-betrayal") as CausalEdge;

console.log("=== §5.1-4  add / remove / sever / re-add ===");
const newEdge: CausalEdge = { id: "edge/probe-ultimatum-requires-exodus", kind: "REQUIRES", from: "ev/exodus", to: "ev/ember-ultimatum" };
line("1 add REQUIRES (both endpoints TRUE)", base, derive(v, [addEdge(newEdge)]));
line("2 sever load-bearing REQUIRES", base, derive(v, [severEdge(requiresOath.id)]));
line("3 sever nonexistent edge", base, derive(v, [severEdge("edge/does-not-exist")]));
line("4 sever + re-add (net zero)", base, derive(v, [severEdge(requiresOath.id), addEdge(requiresOath)]));

console.log("");
console.log("=== §5.5-6  order / representation ===");
const severAdd = derive(v, [severEdge(requiresOath.id), addEdge(requiresOath)]);
const addSever = derive(v, [addEdge(requiresOath), severEdge(requiresOath.id)]);
line("5 [sever,add] vs [add,sever]", severAdd, addSever);
const renoted: CausalEdge = { ...requiresOath, note: "a completely different authorial note" };
line("6 re-add same edge, different note", base, derive(v, [severEdge(requiresOath.id), addEdge(renoted)]));
const reordered: CausalEdge = { id: requiresOath.id, kind: requiresOath.kind, to: requiresOath.to, from: requiresOath.from };
line("6b re-add, keys in different order", base, derive(v, [severEdge(requiresOath.id), addEdge(reordered)]));

console.log("");
console.log("=== §5.7  rejected edge intervention ===");
const malformed: Intervention = { id: "addEdge:malformed", kind: "addEdge", target: "edge/malformed", params: { edge: { id: "edge/malformed", kind: "REQUIRES" } }, label: "malformed addEdge" };
const malformedWorld = derive(v, [malformed]);
line("7 malformed addEdge (no from/to)", base, malformedWorld);
console.log(`    contradictions recorded: ${malformedWorld.contradictions.length} (a refused FACT write records one)`);
const noParams: Intervention = { id: "addEdge:none", kind: "addEdge", target: "edge/none", params: {}, label: "addEdge with no edge" };
line("7b addEdge with no edge param", base, derive(v, [noParams]));

console.log("");
console.log("=== §5.8-9  dormant / verdict-neutral edges, by edge kind ===");
line("8 sever MOTIVATES (inert in propagation)", base, derive(v, [severEdge(motivatesOath.id)]));
line("8b sever ENABLES (soft support)", base, derive(v, [severEdge(enablesVow.id)]));
line("8c sever PRECEDES (no support role)", base, derive(v, [severEdge(precedesOath.id)]));
line("8d sever EXCLUDES (dormant: siege absent)", base, derive(v, [severEdge(excludesSiege.id)]));
line("8e sever INVARIANT (dormant)", base, derive(v, [severEdge(invariantBetrayal.id)]));
line("9 add REQUIRES, consequence dormant", base, derive(v, [addEdge(newEdge)]));

console.log("");
console.log("=== §5.9 DECISIVE: is a dormant causal law counterfactually load-bearing? ===");
// Two worlds whose verdicts and facts coincide, differing only in one edge whose
// consequence is currently dormant. Then apply the SAME further intervention.
const withDormant = derive(v, [addEdge(newEdge)]);
const withoutDormant = base;
const d9 = worldDiff(withoutDormant, withDormant);
console.log(`  worlds differ only in the edge: statusΔ=${d9.statusChanges.length} factΔ=${d9.factAdditions.length + d9.factRemovals.length + d9.factOverrides.length} edgeΔ=${d9.edgeChanges.length}`);
const futureIv = [negateEvent("ev/exodus")];
const futureWith = derive(v, [addEdge(newEdge), ...futureIv]);
const futureWithout = derive(v, futureIv);
console.log(`  SAME later intervention (negate ev/exodus):`);
console.log(`    with dormant edge    -> ev/ember-ultimatum = ${futureWith.statuses["ev/ember-ultimatum"]}`);
console.log(`    without dormant edge -> ev/ember-ultimatum = ${futureWithout.statuses["ev/ember-ultimatum"]}`);
console.log(`    futures differ: ${futureWith.stateHash !== futureWithout.stateHash}`);
console.log(`  => a verdict-neutral edge IS counterfactually load-bearing: excluding it from`);
console.log(`     stateHash would make two worlds "identical" that respond differently to the`);
console.log(`     same intervention.`);

console.log("");
console.log("=== §5.10  edge that changes downstream derivation ===");
line("10 sever wardens-require-oath (cascade)", base, derive(v, [severEdge("edge/wardens-require-kael-oath")]));

console.log("");
console.log("=== §6  does WorldDiff EXPLAIN a causal-law change with unchanged facts? ===");
const lawOnly = worldDiff(base, derive(v, [severEdge(motivatesOath.id)]));
console.log(`  MOTIVATES severed: edgeChanges=${JSON.stringify(lawOnly.edgeChanges)}`);
console.log(`  every other dimension empty: ${
  lawOnly.statusChanges.length === 0 &&
  lawOnly.factAdditions.length === 0 &&
  lawOnly.factRemovals.length === 0 &&
  lawOnly.factOverrides.length === 0 &&
  lawOnly.workStatusChanges.length === 0 &&
  lawOnly.reachabilityChanges.length === 0
}`);
const lawPlusCascade = worldDiff(base, derive(v, [severEdge("edge/wardens-require-kael-oath")]));
console.log(`  load-bearing severed: edgeΔ=${lawPlusCascade.edgeChanges.length} statusΔ=${lawPlusCascade.statusChanges.length} workΔ=${lawPlusCascade.workStatusChanges.length} (direct + derived, distinguishable by dimension)`);

console.log("");
console.log("=== §3  ALTERED is value-semantic ===");
const varaFacts = base.facts.filter((f) => f.subject === "char/vara" && f.predicate === "located_in");
console.log(`  verrin char/vara located_in effective facts: ${varaFacts.map((f) => `${f.id}=${String(f.object)}`).join(", ")}`);
const canonVara = v.facts.filter((f) => f.subject === "char/vara" && f.predicate === "located_in");
console.log(`  canon declares: ${canonVara.map((f) => `${f.id}=${String(f.object)} [${String(f.validFrom)}..${String(f.validTo)}]`).join(", ")}`);
const o = ordosCanon();
const obase = derive(o, []);
console.log(`  ordos work/investitureOfVaela baseline: ${obase.workStatuses[O.works.investitureOfVaela]}`);
for (const [label, ivs] of [
  ["same value (seal held_by vaela)", [setFact(O.objects.seal, "held_by", O.characters.vaela)]],
  ["different value (seal held_by galen)", [setFact(O.objects.seal, "held_by", O.characters.galen)]],
  ["different value on an ANCHORED fact (vaela warden_of council)", [setFact(O.characters.vaela, "warden_of", O.faction.council)]],
] as [string, Intervention[]][]) {
  const w = derive(o, ivs);
  const d = worldDiff(obase, w);
  console.log(
    `    ${label.padEnd(58)} work=${w.workStatuses[O.works.investitureOfVaela]?.padEnd(10)} diffEmpty=${empty(d)} workΔ=${d.workStatusChanges.length}`
  );
}

console.log("");
console.log("=== §3/§8  convergent worlds: same world, different history ===");
line("setFact vs relocate (same cell, same value)", derive(v, [setFact("char/vara", "located_in", "loc/thornhollow")]), derive(v, [relocate("char/vara", "loc/thornhollow")]));
const threeWrites = derive(v, [
  setFact("char/vara", "located_in", "loc/stonehall"),
  setFact("char/vara", "located_in", "loc/thornhollow"),
  setFact("char/vara", "located_in", "loc/valdar"),
]);
line("3 writes ending at the canonical value", base, threeWrites);
const chainA = derive(v, [negateEvent("ev/exodus"), forceEvent("ev/blight-begins")]);
const chainB = derive(v, [forceEvent("ev/blight-begins"), negateEvent("ev/exodus")]);
line("set-like marks, both orders", chainA, chainB);

console.log("");
console.log("=== §7  constraint definition vs satisfaction (ordos) ===");
const bothRites = derive(o, [forceEvent(O.events.galenRecognised), forceEvent(O.events.riteBindingGalen)]);
const dSat = worldDiff(obase, bothRites);
console.log(`  satisfaction changed: constraintΔ=${dSat.constraintViolationsIntroduced.length}/${dSat.constraintViolationsResolved.length} (definition identical: same canonHash)`);
console.log(`  canonHash identical: ${obase.canonId === bothRites.canonId} (same canon object => same declared constraints)`);
// definition change = a DIFFERENT canon document
const noConstraintBody = {
  canonId: o.canonId,
  version: o.version,
  entities: o.entities,
  facts: o.facts,
  edges: o.edges,
  workBindings: o.workBindings,
  unspecified: (o as unknown as { unspecified?: string[] }).unspecified,
};
console.log(`  a definition change is a canon-document change (new canonHash), not a WorldDiff dimension.`);
console.log(`    constraint-free variant hash != declared-constraint hash: ${hashCanon(noConstraintBody) !== o.hash}`);
