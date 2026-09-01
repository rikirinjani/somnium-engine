/**
 * Somnium Engine — P-007 pre-implementation probes.
 *
 * Ground-truth measurements of the CURRENT diff/hash behavior, taken BEFORE
 * any P-007 change. Every probe here maps to a prediction letter in
 * predictions.md. Nothing in this file is speculative: it prints what the
 * engine does today.
 *
 * Run: npx tsx experiments/p007/probes.ts
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon, ORDOS_IDS } from "../../src/canon/ordos";
import { derive } from "../../src/derive/world-state";
import { worldDiff } from "../../src/diff/diff";
import { forceEvent, setFact, severEdge, addEdge } from "../../src/timeline/types";
import type { WorldState } from "../../src/derive/world-state";

const v = verrinCanon();
const base = derive(v, []);

function summarize(name: string, b: WorldState, w: WorldState): void {
  const diff = worldDiff(b, w);
  const empty =
    diff.statusChanges.length === 0 &&
    diff.factAdditions.length === 0 &&
    diff.factRemovals.length === 0 &&
    diff.factOverrides.length === 0 &&
    diff.contradictionsIntroduced.length === 0 &&
    diff.contradictionsResolved.length === 0 &&
    diff.reachabilityChanges.length === 0;
  console.log(
    `${name}: stateHashD=${b.stateHash !== w.stateHash} identityHashD=${b.identityHash !== w.identityHash} ` +
      `diff[status=${diff.statusChanges.length} +fact=${diff.factAdditions.length} -fact=${diff.factRemovals.length} ` +
      `ovr=${diff.factOverrides.length} +contra=${diff.contradictionsIntroduced.length} -contra=${diff.contradictionsResolved.length} ` +
      `reach=${diff.reachabilityChanges.length}] diffEmpty=${empty}`
  );
}

// P1 — self-diff: is diff(A, A) the identity?
{
  const self = worldDiff(base, base);
  const arraysEmpty =
    self.statusChanges.length === 0 &&
    self.factAdditions.length === 0 &&
    self.factRemovals.length === 0 &&
    self.factOverrides.length === 0 &&
    self.contradictionsIntroduced.length === 0 &&
    self.contradictionsResolved.length === 0 &&
    self.reachabilityChanges.length === 0;
  console.log(
    `P1 self-diff: arraysEmpty=${arraysEmpty} workStatusesKeys=${Object.keys(self.workStatuses).length} hash=${self.hash}`
  );
}

// P2 — refused write (illegal predicate): record churn without world movement?
{
  const refused = derive(v, [setFact("char/vara", "not-a-predicate", "x")]);
  summarize("P2 refused-write ", base, refused);
  console.log(`    refused contradictions: ${refused.contradictions.map((c) => c.id).join(", ") || "(none)"}`);
}

// P3 — idempotent setFact (same value the fact already has)
{
  const idem = derive(v, [setFact("char/kael", "sibling_of", "char/vara")]);
  summarize("P3 idempotent-set", base, idem);
  const bf = base.facts.find((f) => f.id === "fact/kael-sibling-vara");
  const wf = idem.facts.find((f) => f.id === "fact/kael-sibling-vara");
  console.log(`    fact source: base=${bf?.source} after=${wf?.source}`);
  // sanity: a REAL override is visible
  const ovr = derive(v, [setFact("char/kael", "sibling_of", "char/maren")]);
  const od = worldDiff(base, ovr);
  console.log(`    sanity real-override: ovr=${od.factOverrides.length} (${od.factOverrides[0]?.from} -> ${od.factOverrides[0]?.to})`);
}

// P4 — force an already-ESTABLISHED event (provenance vs effective state)
{
  const forced = derive(v, [forceEvent("ev/blight-begins")]);
  summarize("P4 force-estab  ", base, forced);
  console.log(`    blight judgment base : ${JSON.stringify(base.judgments["ev/blight-begins"])}`);
  console.log(`    blight judgment forced: ${JSON.stringify(forced.judgments["ev/blight-begins"])}`);
}

// P5 — sever + re-add the same edge (net zero, ordered history)
{
  const edge = v.edges.find((e) => e.id === "edge/kael-oath-requires-blight")!;
  const netZero = derive(v, [severEdge("edge/kael-oath-requires-blight"), addEdge(edge)]);
  summarize("P5 sever+add    ", base, netZero);
  console.log(`    identityHash equals baseline: ${netZero.identityHash === base.identityHash}`);
}

// P6 — one sever, many consequences (H3: minimal record change, big semantic change)
{
  const severed = derive(v, [severEdge("edge/kael-oath-requires-blight")]);
  const diff = worldDiff(base, severed);
  summarize("P6 sever-oath   ", base, severed);
  console.log(
    `    statusChanges: ${diff.statusChanges.map((s) => `${s.entityId}:${s.from}->${s.to}`).join(" ")}`
  );
  const wsDiff = Object.keys(base.workStatuses).filter((k) => base.workStatuses[k] !== severed.workStatuses[k]);
  console.log(`    workStatus changes: ${wsDiff.map((k) => `${k}:${base.workStatuses[k]}->${severed.workStatuses[k]}`).join(" ") || "(none)"}`);
}

// P7 — constraint violation invisible in WorldDiff (the P-006 residual)
{
  const o = ordosCanon();
  const obase = derive(o, []);
  const oviol = derive(o, [
    forceEvent(ORDOS_IDS.events.galenRecognised),
    forceEvent(ORDOS_IDS.events.riteBindingGalen),
  ]);
  const diff = worldDiff(obase, oviol);
  const selfHash = worldDiff(obase, obase).hash;
  console.log(
    `P7 ordos-violation: stateHashD=${obase.stateHash !== oviol.stateHash} ` +
      `violations=${oviol.constraintViolations.map((x) => `${x.typeId}:${x.bound}:obs${x.observed}`).join(", ") || "(none)"} ` +
      `diff[status=${diff.statusChanges.length}] diffHashChanged=${diff.hash !== selfHash} ` +
      `constraintDimensionInDiff=false`
  );
}

// P8 — direction: diff(A,B) vs diff(B,A)
{
  const severed = derive(v, [severEdge("edge/kael-oath-requires-blight")]);
  const fwd = worldDiff(base, severed);
  const rev = worldDiff(severed, base);
  console.log(
    `P8 direction: fwd[0]=${JSON.stringify(fwd.statusChanges[0])} rev[0]=${JSON.stringify(rev.statusChanges[0])} ` +
      `fwd -fact=${fwd.factRemovals.length} rev +fact=${rev.factAdditions.length} ` +
      `fwdHash=${fwd.hash} revHash=${rev.hash} equal=${fwd.hash === rev.hash}`
  );
}

// P9 — composition: diff(A,C) vs diff(A,B) then diff(B,C)
{
  const edge = v.edges.find((e) => e.id === "edge/kael-oath-requires-blight")!;
  const B = derive(v, [severEdge("edge/kael-oath-requires-blight")]);
  const C = derive(v, [severEdge("edge/kael-oath-requires-blight"), addEdge(edge)]);
  const ac = worldDiff(base, C);
  const ab = worldDiff(base, B);
  const bc = worldDiff(B, C);
  const acEmpty =
    ac.statusChanges.length === 0 && ac.factRemovals.length === 0 && ac.factAdditions.length === 0;
  console.log(
    `P9 composition: diff(A,C) empty=${acEmpty} hash=${ac.hash} | diff(A,B) nonempty=${ab.statusChanges.length > 0} ` +
      `diff(B,C) nonempty=${bc.statusChanges.length > 0} — cancellation: composed != direct`
  );
}

// P10 — convergent histories: double force vs single force (set-like dedup)
{
  const once = derive(v, [forceEvent("ev/blight-begins")]);
  const twice = derive(v, [forceEvent("ev/blight-begins"), forceEvent("ev/blight-begins")]);
  console.log(
    `P10 convergence: stateHash equal=${once.stateHash === twice.stateHash} ` +
      `identityHash equal=${once.identityHash === twice.identityHash} ` +
      `diff(once,twice) empty=${worldDiff(once, twice).statusChanges.length === 0}`
  );
}

// P11 — temporal violation invisible in WorldDiff
{
  const cyc = derive(v, [
    addEdge({ id: "edge/probe-vow-before-exodus", kind: "PRECEDES", from: "ev/vara-vow", to: "ev/exodus" }),
  ]);
  summarize("P11 precedes-cyc", base, cyc);
  console.log(
    `    temporalViolations: ${cyc.temporalViolations.length} ` +
      `(${cyc.temporalViolations.map((t) => t.nodes.join("+")).join("; ")}) — diff dimension: none`
  );
  console.log(
    `    statuses: exodus=${cyc.statuses["ev/exodus"]} vara-vow=${cyc.statuses["ev/vara-vow"]} ` +
      `(both must be occurring for the cycle to count)`
  );
}
