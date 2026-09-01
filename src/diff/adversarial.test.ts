/**
 * Somnium Engine — P-007 adversarial probe suite (§10 / §13 of the brief).
 *
 * Runs AFTER the prediction suite is green. Two acceptance criteria, swept over
 * every known mutation/derivation route on BOTH seed canons:
 *
 *   (A) different construction history must not create a fake semantic diff;
 *   (B) different effective-world semantics must not disappear because the
 *       underlying writes look similar.
 *
 * Both reduce to the P-007 invariant, so the sweep asserts it directly:
 *
 *   diffEmpty(worldDiff(A, B))  ⟺  stateHash(A) === stateHash(B)
 *
 * The routes are enumerated from the brief's list rather than from the
 * implementation, so a dimension the implementation forgot shows up as an INV
 * violation rather than as a passing fixture (the NCR-005 discipline: test the
 * whole relevant set, never trust one fixture as proof of a universal).
 */
import { describe, expect, it } from "vitest";
import { verrinCanon } from "../canon/verrin";
import { ordosCanon, ORDOS_IDS as O } from "../canon/ordos";
import { derive } from "../derive/world-state";
import type { WorldState } from "../derive/world-state";
import { worldDiff } from "./diff";
import type { WorldDiff } from "./types";
import {
  addEdge,
  forceEvent,
  negateEvent,
  relocate,
  retractFact,
  setFact,
  severEdge,
} from "../timeline/types";
import type { Intervention } from "../timeline/types";
import type { Canon, CausalEdge } from "../canon/types";

function diffEmpty(d: WorldDiff): boolean {
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

/** Every route named in §10 of the brief, per canon. */
interface Probe {
  route: string;
  a: Intervention[];
  b: Intervention[];
}

function probesFor(canon: Canon, ids: {
  root: string;
  established: string;
  occurrenceA: string;
  occurrenceB: string;
  loadBearingEdge: string;
  inertEdge: string;
  cellSubject: string;
  cellPredicate: string;
  cellValue: string;
  /** two LITERAL (slash-free) intermediate values — id-shaped objects naming
   * undeclared entities are refused, and a refusal is a permanent contradiction
   * record, which would make the route a semantic change rather than churn. */
  literalIntermediates: [string, string];
  /** true only where the canon's chosen cell IS `located_in`, since `relocate`
   * always writes that predicate — otherwise the pair compares two cells. */
  relocateWritesThisCell: boolean;
  factToRetract: string;
  precedesFrom: string;
  precedesTo: string;
  constraintForce?: Intervention[];
}): Probe[] {
  const edge = canon.edges.find((e) => e.id === ids.loadBearingEdge);
  if (edge === undefined) throw new Error(`fixture: ${ids.loadBearingEdge} missing`);
  const newEdge: CausalEdge = {
    id: "edge/adversarial-probe",
    kind: "REQUIRES",
    from: ids.established,
    to: ids.occurrenceA,
  };
  const [mid1, mid2] = ids.literalIntermediates;
  const probes: Probe[] = [
    // --- (A) same world, different history: MUST be empty ---
    { route: "same cell written twice vs once (last write wins)", a: [setFact(ids.cellSubject, ids.cellPredicate, ids.cellValue)], b: [setFact(ids.cellSubject, ids.cellPredicate, mid1), setFact(ids.cellSubject, ids.cellPredicate, ids.cellValue)] },
    { route: "force applied once vs twice (idempotent mark)", a: [forceEvent(ids.established)], b: [forceEvent(ids.established), forceEvent(ids.established)] },
    { route: "negate applied once vs twice", a: [negateEvent(ids.root)], b: [negateEvent(ids.root), negateEvent(ids.root)] },
    { route: "set-like marks in both orders", a: [negateEvent(ids.root), forceEvent(ids.established)], b: [forceEvent(ids.established), negateEvent(ids.root)] },
    { route: "sever+re-add vs baseline (net zero)", a: [], b: [severEdge(edge.id), addEdge(edge)] },
    { route: "no-op sever vs baseline", a: [], b: [severEdge("edge/adversarial-nonexistent")] },
    { route: "rejected edge write vs baseline", a: [], b: [{ id: "addEdge:bad", kind: "addEdge", target: "edge/bad", params: { edge: { id: "edge/bad", kind: "REQUIRES" } }, label: "malformed" }] },
    { route: "retract a nonexistent fact vs baseline", a: [], b: [retractFact("fact/adversarial-nonexistent")] },
    { route: "three writes ending on one value vs one write", a: [setFact(ids.cellSubject, ids.cellPredicate, ids.cellValue)], b: [setFact(ids.cellSubject, ids.cellPredicate, mid1), setFact(ids.cellSubject, ids.cellPredicate, mid2), setFact(ids.cellSubject, ids.cellPredicate, ids.cellValue)] },
    { route: "branch inheritance: prefix then same suffix, two ways", a: [negateEvent(ids.root), forceEvent(ids.established)], b: [forceEvent(ids.established), negateEvent(ids.root)] },

    // --- (B) different world, similar writes: MUST be non-empty ---
    { route: "occurrence removal (negate one occurrence)", a: [], b: [negateEvent(ids.occurrenceA)] },
    { route: "occurrence substitution (negate the sibling instead)", a: [negateEvent(ids.occurrenceA)], b: [negateEvent(ids.occurrenceB)] },
    { route: "causal propagation (negate the root)", a: [], b: [negateEvent(ids.root)] },
    { route: "edge added (dormant consequence)", a: [], b: [addEdge(newEdge)] },
    { route: "edge severed (load-bearing)", a: [], b: [severEdge(edge.id)] },
    { route: "edge severed (inert kind)", a: [], b: [severEdge(ids.inertEdge)] },
    { route: "contradiction created (force+negate)", a: [], b: [forceEvent(ids.occurrenceA), negateEvent(ids.occurrenceA)] },
    { route: "contradiction removed (drop the force)", a: [forceEvent(ids.occurrenceA), negateEvent(ids.occurrenceA)], b: [negateEvent(ids.occurrenceA)] },
    { route: "rejected FACT write (refusal is a permanent record)", a: [], b: [setFact(ids.cellSubject, ids.cellPredicate, "type/adversarial-ghost")] },
    { route: "fact retracted", a: [], b: [retractFact(ids.factToRetract)] },
    { route: "temporal violation created (PRECEDES cycle)", a: [], b: [addEdge({ id: "edge/adversarial-cycle", kind: "PRECEDES", from: ids.precedesFrom, to: ids.precedesTo })] },
    { route: "UNKNOWN preserved vs resolved (force a dormant occurrence)", a: [], b: [forceEvent(ids.occurrenceB)] },
  ];
  // `relocate` hardcodes the `located_in` predicate, so the convergence pair is
  // only well-formed on a canon whose chosen cell is that predicate.
  if (ids.relocateWritesThisCell) {
    probes.push({
      route: "direct fact intervention vs relocate (same cell/value)",
      a: [setFact(ids.cellSubject, ids.cellPredicate, ids.cellValue)],
      b: [relocate(ids.cellSubject, ids.cellValue)],
    });
  }
  if (ids.constraintForce !== undefined) {
    probes.push(
      { route: "cardinality violation created", a: [], b: ids.constraintForce },
      { route: "cardinality violation resolved (negate one)", a: ids.constraintForce, b: [...ids.constraintForce, negateEvent(ids.occurrenceA)] }
    );
  }
  return probes;
}

const SUITES = [
  {
    name: "verrin",
    canon: verrinCanon(),
    ids: {
      root: "ev/blight-begins",
      established: "ev/exodus",
      occurrenceA: "ev/kael-oath",
      occurrenceB: "ev/vara-vow",
      loadBearingEdge: "edge/kael-oath-requires-blight",
      inertEdge: "edge/blight-motivates-oath",
      cellSubject: "char/vara",
      cellPredicate: "located_in",
      cellValue: "loc/thornhollow",
      literalIntermediates: ["nowhereplace", "elsewhereplace"] as [string, string],
      relocateWritesThisCell: true,
      factToRetract: "fact/vara-in-thornhollow",
      precedesFrom: "ev/vara-vow",
      precedesTo: "ev/exodus",
    },
  },
  {
    name: "ordos",
    canon: ordosCanon(),
    ids: {
      root: O.events.oldWardenDies,
      established: O.events.vaelaInvested,
      occurrenceA: O.events.riteBindingVaela,
      occurrenceB: O.events.riteBindingGalen,
      loadBearingEdge: O.edges.vaelaAcclaimedRequiresDeath,
      inertEdge: O.edges.deathBeforeAcclaim,
      cellSubject: O.objects.seal,
      cellPredicate: "made_of",
      cellValue: "silver",
      literalIntermediates: ["nowherestuff", "elsewherestuff"] as [string, string],
      relocateWritesThisCell: false, // ordos declares no located_in facts
      factToRetract: O.facts.sealIsSilver,
      precedesFrom: O.events.riteBindingVaela,
      precedesTo: O.events.oldWardenDies,
      constraintForce: [forceEvent(O.events.galenRecognised), forceEvent(O.events.riteBindingGalen)],
    },
  },
];

describe.each(SUITES)("adversarial: INV holds on every route [$name]", ({ canon, ids }) => {
  const probes = probesFor(canon, ids);

  it("no route breaks diffEmpty ⟺ stateHash equality", () => {
    const broken: string[] = [];
    for (const probe of probes) {
      const A = derive(canon, probe.a);
      const B = derive(canon, probe.b);
      const d = worldDiff(A, B);
      if (diffEmpty(d) !== (A.stateHash === B.stateHash)) {
        broken.push(
          `${probe.route}: diffEmpty=${diffEmpty(d)} stateHashEqual=${A.stateHash === B.stateHash}`
        );
      }
    }
    expect(broken).toEqual([]);
  });

  it("(A) history-only differences never manufacture a semantic diff", () => {
    // The routes whose two sides are the same world reached differently. Each
    // MUST be empty; if any is not, the diff is reporting provenance.
    const historyOnly = [
      "same cell written twice vs once (last write wins)",
      "force applied once vs twice (idempotent mark)",
      "negate applied once vs twice",
      "set-like marks in both orders",
      "sever+re-add vs baseline (net zero)",
      "no-op sever vs baseline",
      "rejected edge write vs baseline",
      "retract a nonexistent fact vs baseline",
      "three writes ending on one value vs one write",
      "branch inheritance: prefix then same suffix, two ways",
      "direct fact intervention vs relocate (same cell/value)",
    ];
    const offenders: string[] = [];
    for (const route of historyOnly) {
      const probe = probes.find((p) => p.route === route);
      if (probe === undefined) continue; // route not applicable to this canon
      const A = derive(canon, probe.a);
      const B = derive(canon, probe.b);
      if (!diffEmpty(worldDiff(A, B))) offenders.push(route);
    }
    expect(offenders).toEqual([]);
  });

  it("(B) semantic differences are never hidden behind similar writes", () => {
    const semantic = probes
      .map((p) => p.route)
      .filter((r) =>
        [
          "occurrence removal (negate one occurrence)",
          "occurrence substitution (negate the sibling instead)",
          "causal propagation (negate the root)",
          "edge added (dormant consequence)",
          "edge severed (load-bearing)",
          "edge severed (inert kind)",
          "contradiction created (force+negate)",
          "contradiction removed (drop the force)",
          "rejected FACT write (refusal is a permanent record)",
          "fact retracted",
          "temporal violation created (PRECEDES cycle)",
          "cardinality violation created",
          "cardinality violation resolved (negate one)",
        ].includes(r)
      );
    const hidden: string[] = [];
    for (const route of semantic) {
      const probe = probes.find((p) => p.route === route);
      if (probe === undefined) throw new Error(`probe missing: ${route}`);
      const A = derive(canon, probe.a);
      const B = derive(canon, probe.b);
      if (diffEmpty(worldDiff(A, B))) hidden.push(route);
    }
    expect(hidden).toEqual([]);
  });

  it("every route's diff is deterministic and self-consistent", () => {
    for (const probe of probes) {
      const A = derive(canon, probe.a);
      const B = derive(canon, probe.b);
      const d1 = worldDiff(A, B);
      const d2 = worldDiff(A, B);
      expect(JSON.stringify(d1), probe.route).toBe(JSON.stringify(d2));
      // an empty diff always has the same identity as a self-diff
      if (diffEmpty(d1)) expect(d1.hash, probe.route).toBe(worldDiff(A, A).hash);
    }
  });

  it("the three identity layers stay separate on every route", () => {
    for (const probe of probes) {
      const A = derive(canon, probe.a);
      const B = derive(canon, probe.b);
      // stateHash equality implies the diff is empty (world identity), while
      // identityHash may still differ (lineage). The converse — identityHash
      // equal but stateHash different — is impossible by construction, since
      // identityHash folds stateHash.
      if (A.stateHash === B.stateHash) {
        expect(diffEmpty(worldDiff(A, B)), probe.route).toBe(true);
      }
      if (A.identityHash === B.identityHash) {
        expect(A.stateHash, probe.route).toBe(B.stateHash);
      }
    }
  });
});

describe("adversarial: dormant causal law is counterfactually load-bearing", () => {
  // The strongest statement of why `edges` belongs in world identity. Proven
  // per canon: two worlds agreeing on every verdict and fact, differing only in
  // one dormant edge, respond DIFFERENTLY to the same later intervention.
  it.each([
    {
      name: "verrin",
      canon: verrinCanon(),
      dormant: { id: "edge/adv-ultimatum-requires-exodus", kind: "REQUIRES", from: "ev/exodus", to: "ev/ember-ultimatum" } as CausalEdge,
      prerequisite: "ev/exodus",
      dependent: "ev/ember-ultimatum",
    },
    {
      name: "ordos",
      canon: ordosCanon(),
      dormant: { id: "edge/adv-survey-requires-investiture", kind: "REQUIRES", from: O.events.vaelaInvested, to: O.events.sealSurvey } as CausalEdge,
      prerequisite: O.events.vaelaInvested,
      dependent: O.events.sealSurvey,
    },
  ])("$name: verdict-identical worlds diverge under the same intervention", ({ canon, dormant, prerequisite, dependent }) => {
    const A = derive(canon, []);
    const B = derive(canon, [addEdge(dormant)]);
    // indistinguishable by verdicts and facts...
    expect(B.statuses).toEqual(A.statuses);
    expect(B.facts).toEqual(A.facts);
    expect(B.workStatuses).toEqual(A.workStatuses);
    // ...and yet not the same world:
    const futureA: WorldState = derive(canon, [negateEvent(prerequisite)]);
    const futureB: WorldState = derive(canon, [addEdge(dormant), negateEvent(prerequisite)]);
    expect(futureA.statuses[dependent]).toBe("ESTABLISHED");
    expect(futureB.statuses[dependent]).toBe("UNSUPPORTED");
    expect(futureA.stateHash).not.toBe(futureB.stateHash);
    // which is exactly why A and B must not share a stateHash
    expect(A.stateHash).not.toBe(B.stateHash);
    expect(worldDiff(A, B).edgeChanges).toHaveLength(1);
  });
});
