/**
 * Somnium Engine — propagation tests (P-003 rewrite).
 *
 * These replace the P-001 suite, several of whose assertions encoded semantics
 * the adversarial pass proved wrong (notably: a blocked ENABLES source refuting
 * its target, and a bootstrap cycle being reported as UNKNOWN).
 *
 * Fixture shape (self-contained):
 *   ev/root1, ev/root2, ev/end      — declared roots
 *   ev/child1  REQUIRES ev/root1
 *   ev/grandchild REQUIRES ev/child1
 *   ev/peer    REQUIRES ev/root2
 *   ev/team-a, ev/team-b REQUIRES ev/root2, and EXCLUDES each other
 *   ev/doomed  REQUIRES ev/team-a, and INVARIANT from ev/root1
 *   ev/cyc-a <-> ev/cyc-b           — REQUIRES bootstrap cycle
 *   ev/soft    REQUIRES ev/cyc-a, ENABLES from ev/root1
 */
import { describe, expect, it } from "vitest";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "../canon/types";
import { hashCanon } from "../canon/hash";
import { derive } from "./world-state";
import { buildModel, propagateJudgments, temporalViolations } from "./propagation";
import { negateEvent, forceEvent, severEdge, addEdge } from "../timeline/types";

function makeCanon(extraEdges: CausalEdge[] = [], extraEntities: Entity[] = []): Canon {
  const entities: Entity[] = [
    { id: "char/hero", kind: "Character", name: "Hero" },
    { id: "ev/root1", kind: "Event", name: "Root One" },
    { id: "ev/root2", kind: "Event", name: "Root Two" },
    { id: "ev/end", kind: "Event", name: "The Pivot" },
    { id: "ev/child1", kind: "Event", name: "Child One" },
    { id: "ev/grandchild", kind: "Event", name: "Grandchild" },
    { id: "ev/peer", kind: "Event", name: "Peer" },
    { id: "ev/team-a", kind: "Event", name: "Team A" },
    { id: "ev/team-b", kind: "Event", name: "Team B" },
    { id: "ev/doomed", kind: "Event", name: "Doomed" },
    { id: "ev/cyc-a", kind: "Event", name: "Cycle A" },
    { id: "ev/cyc-b", kind: "Event", name: "Cycle B" },
    { id: "ev/soft", kind: "Event", name: "Soft" },
    ...extraEntities,
  ];
  const facts: Fact[] = [
    { id: "fact/hero-home", subject: "char/hero", predicate: "located_in", object: "loc/home", validFrom: null, validTo: "ev/end", source: "canon" },
    { id: "fact/hero-away", subject: "char/hero", predicate: "located_in", object: "loc/away", validFrom: "ev/end", validTo: null, source: "canon" },
  ];
  const edges: CausalEdge[] = [
    { id: "edge/child1-requires-root1", kind: "REQUIRES", from: "ev/root1", to: "ev/child1" },
    { id: "edge/grandchild-requires-child1", kind: "REQUIRES", from: "ev/child1", to: "ev/grandchild" },
    { id: "edge/peer-requires-root2", kind: "REQUIRES", from: "ev/root2", to: "ev/peer" },
    { id: "edge/team-a-requires-root2", kind: "REQUIRES", from: "ev/root2", to: "ev/team-a" },
    { id: "edge/team-b-requires-root2", kind: "REQUIRES", from: "ev/root2", to: "ev/team-b" },
    { id: "edge/doomed-requires-team-a", kind: "REQUIRES", from: "ev/team-a", to: "ev/doomed" },
    { id: "edge/cyc-a-requires-cyc-b", kind: "REQUIRES", from: "ev/cyc-b", to: "ev/cyc-a" },
    { id: "edge/cyc-b-requires-cyc-a", kind: "REQUIRES", from: "ev/cyc-a", to: "ev/cyc-b" },
    { id: "edge/soft-requires-cyc-a", kind: "REQUIRES", from: "ev/cyc-a", to: "ev/soft" },
    { id: "edge/team-excludes", kind: "EXCLUDES", from: "ev/team-a", to: "ev/team-b" },
    { id: "edge/invariant-doomed", kind: "INVARIANT", from: "ev/root1", to: "ev/doomed" },
    { id: "edge/soft-enabled", kind: "ENABLES", from: "ev/root1", to: "ev/soft" },
    ...extraEdges,
  ];
  const workBindings: WorkBinding[] = [
    { workId: "work/chain", events: ["ev/root1", "ev/child1", "ev/grandchild"] },
  ];
  const canon: Canon = {
    canonId: "canon/derive-unit",
    version: "0.0.1",
    entities,
    facts,
    edges,
    workBindings,
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

const s = (ws: ReturnType<typeof derive>, id: string): string => ws.statuses[id] ?? "UNKNOWN";
const j = (ws: ReturnType<typeof derive>, id: string) => ws.judgments[id];

describe("model construction", () => {
  it("sorts node ids and records intervention targets separately from conclusions", () => {
    const model = buildModel(makeCanon(), [negateEvent("ev/root1"), forceEvent("ev/peer")]);
    expect(model.nodeIds).toEqual([...model.nodeIds].sort());
    expect(model.negated.has("ev/root1")).toBe(true);
    expect(model.forcedBy.get("ev/peer")).toBe("forceEvent:ev/peer");
    // negate/force are INPUTS, not statuses — they live in their own fields.
    expect(model.negated.has("ev/peer")).toBe(false);
  });

  it("groups REQUIRES edges into sufficient sets, defaulting to one group", () => {
    const model = buildModel(makeCanon(), []);
    const groups = model.supportGroups.get("ev/child1") ?? [];
    expect(groups).toEqual([{ group: "0", conjuncts: ["ev/root1"] }]);
  });

  it("distinguishes declared nodes from ids canon merely references", () => {
    const model = buildModel(
      makeCanon([{ id: "edge/mystery", kind: "REQUIRES", from: "ev/mystery", to: "ev/end" }]),
      []
    );
    expect(model.declared.has("ev/root1")).toBe(true);
    expect(model.declared.has("ev/mystery")).toBe(false); // referenced, never declared
  });
});

describe("REQUIRES: conjunctive support (backward compatible)", () => {
  it("establishes a root and its whole chain", () => {
    const ws = derive(makeCanon(), []);
    expect(s(ws, "ev/root1")).toBe("ESTABLISHED");
    expect(s(ws, "ev/child1")).toBe("ESTABLISHED");
    expect(s(ws, "ev/grandchild")).toBe("ESTABLISHED");
  });

  it("negating a root cascades UNSUPPORTED down the chain (case A + B)", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root1")]);
    expect(s(ws, "ev/root1")).toBe("EXCLUDED"); // intervention input
    expect(s(ws, "ev/child1")).toBe("UNSUPPORTED"); // direct prerequisite gone
    expect(s(ws, "ev/grandchild")).toBe("UNSUPPORTED"); // indirect
  });

  it("distinguishes EXCLUDED (intervention) from UNSUPPORTED (derived)", () => {
    // The old single-axis model gave these the same rank. They are different
    // kinds of claim: one is an input, one is a conclusion.
    const ws = derive(makeCanon(), [negateEvent("ev/root1")]);
    expect(j(ws, "ev/root1")).toMatchObject({ truth: "FALSE", negated: true });
    expect(j(ws, "ev/child1")).toMatchObject({ truth: "FALSE", negated: false, support: "NONE" });
  });
});

describe("REQUIRES: alternative sufficient causes (case C)", () => {
  /** ev/end additionally supported by (ev/root1) OR (ev/root2) via two groups. */
  function disjunctiveCanon(): Canon {
    return makeCanon([
      { id: "edge/end-via-a", kind: "REQUIRES", from: "ev/root1", to: "ev/end", group: "a" },
      { id: "edge/end-via-b", kind: "REQUIRES", from: "ev/root2", to: "ev/end", group: "b" },
    ]);
  }

  it("survives removal of one sufficient cause while the other holds", () => {
    const ws = derive(disjunctiveCanon(), [negateEvent("ev/root1")]);
    expect(s(ws, "ev/root1")).toBe("EXCLUDED");
    expect(s(ws, "ev/root2")).toBe("ESTABLISHED");
    expect(s(ws, "ev/end")).toBe("ESTABLISHED"); // group "b" still satisfied
  });

  it("is refuted only when EVERY sufficient set is refuted", () => {
    const ws = derive(disjunctiveCanon(), [negateEvent("ev/root1"), negateEvent("ev/root2")]);
    expect(s(ws, "ev/end")).toBe("UNSUPPORTED");
  });

  it("conjuncts within one group must all hold (case D)", () => {
    // Both conjuncts in group "a"; removing one refutes the group, and with no
    // alternative group the target is unsupported.
    const canon = makeCanon([
      { id: "edge/end-and-1", kind: "REQUIRES", from: "ev/root1", to: "ev/end", group: "a" },
      { id: "edge/end-and-2", kind: "REQUIRES", from: "ev/root2", to: "ev/end", group: "a" },
    ]);
    expect(s(derive(canon, []), "ev/end")).toBe("ESTABLISHED");
    expect(s(derive(canon, [negateEvent("ev/root1")]), "ev/end")).toBe("UNSUPPORTED");
  });
});

describe("ENABLES: soft support that never grounds and never refutes (case G-adjacent)", () => {
  it("yields CONTINGENT when the hard path is unresolved but an enabler occurs", () => {
    // ev/soft's hard prerequisite is the bootstrap cycle. Sever the cycle's
    // grounding requirement so the hard path is genuinely unresolved rather than
    // refuted, leaving only the enabling path.
    const canon = makeCanon([
      { id: "edge/soft-needs-mystery", kind: "REQUIRES", from: "ev/mystery", to: "ev/pending" },
      { id: "edge/pending-enabled", kind: "ENABLES", from: "ev/root1", to: "ev/pending" },
    ], [{ id: "ev/pending", kind: "Event", name: "Pending" }]);
    const ws = derive(canon, []);
    // hard support is NEITHER (mystery is undeclared), an enabler occurs => SOFT
    expect(j(ws, "ev/pending")).toMatchObject({ truth: "NEITHER", support: "SOFT" });
    expect(s(ws, "ev/pending")).toBe("CONTINGENT");
  });

  it("REMOVING an enabler never makes a node FALSE", () => {
    // This is the P-001 defect: the old code degraded a blocked-enabler target
    // to UNSUPPORTED, i.e. it treated an enabling condition as a necessity.
    const canon = makeCanon([
      { id: "edge/pending-needs-mystery", kind: "REQUIRES", from: "ev/mystery", to: "ev/pending" },
      { id: "edge/pending-enabled", kind: "ENABLES", from: "ev/root1", to: "ev/pending" },
    ], [{ id: "ev/pending", kind: "Event", name: "Pending" }]);

    const withEnabler = derive(canon, []);
    const enablerGone = derive(canon, [negateEvent("ev/root1")]);

    expect(s(withEnabler, "ev/pending")).toBe("CONTINGENT");
    // enabler gone => we lose the soft route, but we learn nothing about truth
    expect(j(enablerGone, "ev/pending")).toMatchObject({ truth: "NEITHER" });
    expect(s(enablerGone, "ev/pending")).toBe("UNKNOWN");
    expect(s(enablerGone, "ev/pending")).not.toBe("UNSUPPORTED");
  });

  it("cannot resurrect a node whose hard support is refuted", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/cyc-a")]);
    // ev/soft REQUIRES ev/cyc-a (now excluded) and is ENABLED by root1 (occurs)
    expect(s(ws, "ev/soft")).toBe("UNSUPPORTED");
  });
});

describe("bootstrap cycles: well-founded rejection (case E)", () => {
  it("rejects mutual REQUIRES with no external ground as UNSUPPORTED, not UNKNOWN", () => {
    // P-001 reported these as UNKNOWN, i.e. "we don't know". That is wrong:
    // there is no grounding derivation, so well-founded semantics says false.
    const ws = derive(makeCanon(), []);
    expect(j(ws, "ev/cyc-a")).toMatchObject({ truth: "FALSE", support: "UNFOUNDED" });
    expect(j(ws, "ev/cyc-b")).toMatchObject({ truth: "FALSE", support: "UNFOUNDED" });
    expect(s(ws, "ev/cyc-a")).toBe("UNSUPPORTED");
  });

  it("emits NO contradiction for an unfounded cycle — the world is consistent", () => {
    const ws = derive(makeCanon(), []);
    const cycleRecords = ws.contradictions.filter((c) => c.a.startsWith("ev/cyc") || c.b.startsWith("ev/cyc"));
    expect(cycleRecords).toEqual([]);
  });

  it("grounds a cycle when an alternative sufficient set reaches outside it", () => {
    const canon = makeCanon([
      { id: "edge/cyc-a-alt", kind: "REQUIRES", from: "ev/root1", to: "ev/cyc-a", group: "alt" },
    ]);
    const ws = derive(canon, []);
    expect(s(ws, "ev/cyc-a")).toBe("ESTABLISHED"); // group "alt" is externally grounded
    expect(s(ws, "ev/cyc-b")).toBe("ESTABLISHED");
  });

  it("leaves an ENABLES-only cycle UNKNOWN — neither established nor refuted", () => {
    const canon = makeCanon([
      { id: "edge/e1", kind: "ENABLES", from: "ev/e-b", to: "ev/e-a" },
      { id: "edge/e2", kind: "ENABLES", from: "ev/e-a", to: "ev/e-b" },
      { id: "edge/e-a-needs", kind: "REQUIRES", from: "ev/mystery", to: "ev/e-a" },
      { id: "edge/e-b-needs", kind: "REQUIRES", from: "ev/mystery", to: "ev/e-b" },
    ], [
      { id: "ev/e-a", kind: "Event", name: "E A" },
      { id: "ev/e-b", kind: "Event", name: "E B" },
    ]);
    const ws = derive(canon, []);
    // No enabler actually occurs, so support stays NONE: the correct skeptical
    // answer for a mutually-reinforcing soft structure.
    expect(s(ws, "ev/e-a")).toBe("UNKNOWN");
    expect(s(ws, "ev/e-b")).toBe("UNKNOWN");
  });
});

describe("under-specification: absence of knowledge is never falsehood (case K)", () => {
  it("keeps a dependent on an undeclared prerequisite at UNKNOWN", () => {
    const canon = makeCanon([
      { id: "edge/end-needs-mystery", kind: "REQUIRES", from: "ev/mystery", to: "ev/pending" },
    ], [{ id: "ev/pending", kind: "Event", name: "Pending" }]);
    const ws = derive(canon, []);
    expect(s(ws, "ev/mystery")).toBe("UNKNOWN"); // referenced, never declared
    expect(s(ws, "ev/pending")).toBe("UNKNOWN"); // and so its dependent
    expect(s(ws, "ev/pending")).not.toBe("UNSUPPORTED");
    expect(s(ws, "ev/pending")).not.toBe("EXCLUDED");
  });

  it("separates under-specification (UNKNOWN) from bootstrap (UNSUPPORTED) in ONE world", () => {
    // The crux distinction, asserted side by side: both nodes are "not TRUE",
    // but for categorically different reasons.
    const canon = makeCanon([
      { id: "edge/pending-needs-mystery", kind: "REQUIRES", from: "ev/mystery", to: "ev/pending" },
    ], [{ id: "ev/pending", kind: "Event", name: "Pending" }]);
    const ws = derive(canon, []);
    expect(s(ws, "ev/pending")).toBe("UNKNOWN"); // no information
    expect(s(ws, "ev/cyc-a")).toBe("UNSUPPORTED"); // no grounding derivation
  });
});

describe("EXCLUDES: mutual exclusion violated is a contradiction (case H)", () => {
  it("marks both endpoints CONTRADICTORY when both occur, with records", () => {
    const ws = derive(makeCanon(), []);
    expect(s(ws, "ev/team-a")).toBe("CONTRADICTORY");
    expect(s(ws, "ev/team-b")).toBe("CONTRADICTORY");
    expect(ws.contradictions.map((c) => c.id)).toContain("contra:edge/team-excludes:excludes:ev/team-a");
    expect(ws.contradictions.map((c) => c.id)).toContain("contra:edge/team-excludes:excludes:ev/team-b");
  });

  it("is satisfied — no contradiction — when only one side occurs", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/team-b")]);
    expect(s(ws, "ev/team-a")).toBe("ESTABLISHED");
    expect(s(ws, "ev/team-b")).toBe("EXCLUDED");
    expect(ws.contradictions.filter((c) => c.id.includes("excludes"))).toEqual([]);
  });

  it("does NOT report the excluded side as CONTRADICTORY", () => {
    // EXCLUDED means "an intervention removed it"; CONTRADICTORY means "the
    // world asserts an impossibility". Keeping them distinct is the point.
    const ws = derive(makeCanon(), [negateEvent("ev/team-b")]);
    expect(s(ws, "ev/team-b")).not.toBe("CONTRADICTORY");
  });
});

describe("INVARIANT: directed prohibition (case I)", () => {
  it("holds silently across branches when never violated", () => {
    // ev/doomed REQUIRES ev/team-a, which is contradictory, so doomed does not
    // occur and the invariant is satisfied with no record.
    const ws = derive(makeCanon(), [negateEvent("ev/team-a")]);
    expect(s(ws, "ev/doomed")).toBe("UNSUPPORTED");
    expect(ws.contradictions.filter((c) => c.id.includes("invariant"))).toEqual([]);
  });

  it("taints the TARGET, not the rule-triggering source, when violated", () => {
    // Force doomed to occur while root1 (the prohibiting source) also occurs.
    const ws = derive(makeCanon(), [forceEvent("ev/doomed")]);
    expect(s(ws, "ev/root1")).toBe("ESTABLISHED"); // source NOT tainted
    expect(s(ws, "ev/doomed")).toBe("CONTRADICTORY");
    const record = ws.contradictions.find((c) => c.id.includes("invariant"));
    expect(record?.a).toBe("ev/root1"); // the prohibiting rule's source
    expect(record?.b).toBe("ev/doomed"); // the violation site
  });
});

describe("interventions: force and negate", () => {
  it("force + negate on one node is a contradiction with intervention provenance", () => {
    const ws = derive(makeCanon(), [forceEvent("ev/child1"), negateEvent("ev/child1")]);
    expect(s(ws, "ev/child1")).toBe("CONTRADICTORY");
    const record = ws.contradictions.find((c) => c.id === "contra:ev/child1:force-vs-negate");
    expect(record?.source).toBe("forceEvent:ev/child1"); // NOT "canon"
  });

  it("forcing an event whose prerequisite is negated is a contradiction", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root1"), forceEvent("ev/child1")]);
    expect(s(ws, "ev/child1")).toBe("CONTRADICTORY");
    const record = ws.contradictions.find((c) => c.id === "contra:ev/child1:force-vs-excluded");
    expect(record?.b).toBe("ev/root1");
    expect(record?.source).toBe("forceEvent:ev/child1");
  });

  it("forcing an event with satisfied prerequisites is simply established", () => {
    const ws = derive(makeCanon(), [forceEvent("ev/child1")]);
    expect(s(ws, "ev/child1")).toBe("ESTABLISHED");
    expect(ws.contradictions.filter((c) => c.a === "ev/child1")).toEqual([]);
  });

  it("negation is authoritative — canon prerequisites do not re-establish it", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/child1")]);
    expect(s(ws, "ev/root1")).toBe("ESTABLISHED"); // prerequisite still holds
    expect(s(ws, "ev/child1")).toBe("EXCLUDED"); // but the event is removed
  });
});

describe("severEdge / addEdge reshape the support graph", () => {
  it("severing a REQUIRES edge makes the target a root", () => {
    const ws = derive(makeCanon(), [negateEvent("ev/root1"), severEdge("edge/child1-requires-root1")]);
    expect(s(ws, "ev/child1")).toBe("ESTABLISHED"); // no prerequisites left
  });

  it("adding a REQUIRES edge introduces a new prerequisite", () => {
    const ws = derive(
      makeCanon(),
      [
        negateEvent("ev/root2"),
        addEdge({ id: "edge/new", kind: "REQUIRES", from: "ev/root2", to: "ev/child1" }),
      ]
    );
    expect(s(ws, "ev/child1")).toBe("UNSUPPORTED"); // default group "0" => conjunction
  });
});

describe("MOTIVATES and PRECEDES do not propagate (cases F and G)", () => {
  it("MOTIVATES never grounds its target", () => {
    const canon = makeCanon([
      { id: "edge/motive", kind: "MOTIVATES", from: "ev/root1", to: "ev/pending" },
      { id: "edge/pending-needs-mystery", kind: "REQUIRES", from: "ev/mystery", to: "ev/pending" },
    ], [{ id: "ev/pending", kind: "Event", name: "Pending" }]);
    const ws = derive(canon, []);
    // root1 occurs and motivates pending, but motivation is not support.
    expect(s(ws, "ev/root1")).toBe("ESTABLISHED");
    expect(s(ws, "ev/pending")).toBe("UNKNOWN");
  });

  it("removing a MOTIVATES source changes nothing about status", () => {
    const canon = makeCanon([{ id: "edge/motive", kind: "MOTIVATES", from: "ev/root1", to: "ev/peer" }]);
    const withMotive = derive(canon, []);
    const severed = derive(canon, [severEdge("edge/motive")]);
    expect(withMotive.statuses).toEqual(severed.statuses);
  });

  it("PRECEDES does not imply causation: removing the earlier event leaves the later one alone", () => {
    const canon = makeCanon([{ id: "edge/order", kind: "PRECEDES", from: "ev/root1", to: "ev/peer" }]);
    const ws = derive(canon, [negateEvent("ev/root1")]);
    expect(s(ws, "ev/root1")).toBe("EXCLUDED");
    expect(s(ws, "ev/peer")).toBe("ESTABLISHED"); // ordering is not support
  });

  it("detects an unsatisfiable timeline as a temporal violation, not a status change", () => {
    const canon = makeCanon([
      { id: "edge/o1", kind: "PRECEDES", from: "ev/root1", to: "ev/root2" },
      { id: "edge/o2", kind: "PRECEDES", from: "ev/root2", to: "ev/root1" },
    ]);
    const ws = derive(canon, []);
    expect(ws.temporalViolations.length).toBe(1);
    expect(ws.temporalViolations[0]?.nodes).toEqual(["ev/root1", "ev/root2"]);
    // ... and both events remain established: the timeline is broken, not the events.
    expect(s(ws, "ev/root1")).toBe("ESTABLISHED");
    expect(s(ws, "ev/root2")).toBe("ESTABLISHED");
  });

  it("ignores PRECEDES cycles among events that do not occur", () => {
    const canon = makeCanon([
      { id: "edge/o1", kind: "PRECEDES", from: "ev/root1", to: "ev/root2" },
      { id: "edge/o2", kind: "PRECEDES", from: "ev/root2", to: "ev/root1" },
    ]);
    const ws = derive(canon, [negateEvent("ev/root1")]);
    expect(ws.temporalViolations).toEqual([]);
  });
});

describe("fixpoint properties", () => {
  it("is deterministic across repeated evaluation", () => {
    const canon = makeCanon();
    const a = propagateJudgments(buildModel(canon, [negateEvent("ev/root1")]));
    const b = propagateJudgments(buildModel(canon, [negateEvent("ev/root1")]));
    expect([...a.judgments.entries()].sort()).toEqual([...b.judgments.entries()].sort());
    expect(a.conflicts).toEqual(b.conflicts);
  });

  it("is order-independent in the intervention list for commuting interventions", () => {
    const canon = makeCanon();
    const ab = derive(canon, [negateEvent("ev/root1"), negateEvent("ev/root2")]);
    const ba = derive(canon, [negateEvent("ev/root2"), negateEvent("ev/root1")]);
    expect(ab.statuses).toEqual(ba.statuses);
    // Two negateEvent marks are set-like, so the hash folds them in as a sorted
    // deduplicated set and both orders share one identity. Sequential kinds
    // (severEdge/addEdge, setFact/relocate/retractFact) are hashed in ACTUAL
    // order — see src/derive/ordering.test.ts for the full three-class split.
    expect(ab.hash).toBe(ba.hash);
  });

  it("converges without hitting the pass cap on a deep chain", () => {
    // 40-node REQUIRES chain: a monotone operator converges; the cap would throw.
    const extraEntities: Entity[] = [];
    const extraEdges: CausalEdge[] = [];
    for (let i = 0; i < 40; i++) {
      extraEntities.push({ id: `ev/n${i}`, kind: "Event", name: `N${i}` });
      if (i > 0) {
        extraEdges.push({ id: `edge/n${i}`, kind: "REQUIRES", from: `ev/n${i - 1}`, to: `ev/n${i}` });
      }
    }
    const ws = derive(makeCanon(extraEdges, extraEntities), []);
    expect(s(ws, "ev/n39")).toBe("ESTABLISHED");
    const negated = derive(makeCanon(extraEdges, extraEntities), [negateEvent("ev/n0")]);
    expect(s(negated, "ev/n39")).toBe("UNSUPPORTED");
  });

  it("exposes temporalViolations as a pure function of model and judgments", () => {
    const canon = makeCanon();
    const model = buildModel(canon, []);
    const { judgments } = propagateJudgments(model);
    expect(temporalViolations(model, judgments)).toEqual(temporalViolations(model, judgments));
  });
});
