/**
 * Somnium Engine — causal propagation (P-003 rewrite).
 *
 * WHY THIS WAS REWRITTEN. The P-001/P-002 propagation had four defects that the
 * adversarial pass confirmed:
 *
 *   1. Support was conjunction-only. `A OR B -> C` was inexpressible, so
 *      removing A always killed C even when B still held.
 *   2. It propagated a single `EventStatus` that conflated truth, epistemic
 *      state, support and conflict on one axis.
 *   3. It was advertised as a "monotone fixpoint" but statuses could DECREASE
 *      across passes, and a silent pass cap masked the oscillation.
 *   4. ENABLES behaved like necessity: a blocked enabler degraded its target to
 *      UNSUPPORTED, i.e. removing an *enabling* condition could refute an event.
 *
 * THE STAGED PIPELINE. Propagation now runs in explicit stages so that each
 * stage has a provable property, rather than one loop with mixed semantics:
 *
 *   Phase A — positive 3-valued fixpoint over {NEITHER, TRUE, FALSE}.
 *             Kleene `conjoin`/`disjoin` are monotone in the 3-valued
 *             information order, and a decided value is sticky, so this is a
 *             genuine least fixpoint (Knaster-Tarski on a height-2 lattice).
 *             BOTH is deliberately EXCLUDED from this phase: admitting it is
 *             what made the old operator non-monotone (a TRUE conjunct turning
 *             BOTH flips `conjoin` from TRUE to FALSE).
 *   Phase B — greatest unfounded set (well-founded semantics). Nodes still
 *             NEITHER whose every support group is grounded only through other
 *             still-NEITHER candidates are FALSE/UNFOUNDED: cyclic self-support
 *             with no external ground is rejected, not believed.
 *   Phase C — soft support. ENABLES can raise `support` to SOFT but can never
 *             change truth in either direction.
 *   Phase D — constraint checks (EXCLUDES, INVARIANT) and intervention
 *             conflicts (forced-vs-negated, forced-vs-refuted) produce BOTH.
 *
 * CONTRADICTION IS LOCALIZED, NOT PROPAGATED (v1 decision). A node that becomes
 * BOTH in Phase D does not retroactively refute its dependents. Rationale:
 * re-entering the fixpoint with BOTH admitted reintroduces exactly the
 * non-monotonicity this rewrite removes. The contradiction is surfaced with
 * provenance instead of being spread or repaired. Recorded as a remaining risk
 * in docs/ARCHITECTURE-RECONNAISSANCE.md §17.
 *
 * EDGE SEMANTICS (each kind does exactly one job):
 *   REQUIRES  — support. Grouped: same target + same group = conjuncts of one
 *               sufficient set; different groups = ALTERNATIVE sufficient sets.
 *   ENABLES   — soft support only. Never grounds, never refutes.
 *   MOTIVATES — narrative pressure. Zero effect on any judgment.
 *   PRECEDES  — temporal constraint layer. Zero effect on any judgment.
 *   EXCLUDES  — symmetric constraint. Both occurring => both BOTH.
 *   INVARIANT — directed prohibition. Both occurring => the TARGET is BOTH;
 *               the source is not tainted (the rule blames the violation).
 */
import type { Canon, CausalEdge, Fact } from "../canon/types";
import type { Intervention } from "../timeline/types";
import type { Judgment, SupportKind, TruthValue } from "./judgment";
import { conjoin, disjoin, joinTruth, occurs, truthRank } from "./judgment";

/** One sufficient support set: a conjunction of prerequisites. */
export interface SupportGroup {
  group: string;
  conjuncts: string[];
}

/** A PRECEDES cycle among nodes that occur — an unsatisfiable timeline. */
export interface TemporalViolation {
  edgeIds: string[];
  nodes: string[];
  detail: string;
}

export interface DerivationModel {
  /** every node, sorted: canon events, edge endpoints, intervention targets */
  nodeIds: string[];
  /**
   * Nodes canon actually DECLARES (Event entities + fact ids). An id that
   * appears only as an edge endpoint is *undeclared*: canon references it
   * without saying what it is. Undeclared nodes are UNKNOWN, never roots —
   * this is what keeps an under-specified prerequisite from silently becoming
   * a true premise (adversarial case K).
   */
  declared: Set<string>;
  /** target -> alternative sufficient support sets (sorted by group) */
  supportGroups: Map<string, SupportGroup[]>;
  /** target -> sorted ENABLES source ids */
  enablesIn: Map<string, string[]>;
  precedesEdges: CausalEdge[];
  excludesEdges: CausalEdge[];
  invariantEdges: CausalEdge[];
  /** do(X never happens) targets */
  negated: Set<string>;
  /** do(X happens) target -> the intervention id that forced it */
  forcedBy: Map<string, string>;
  /** fact nodes participating in the graph, by id */
  facts: Map<string, Fact>;
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/** Edge set after severEdge/addEdge interventions, applied in order. */
function resolveEdges(canon: Canon, interventions: Intervention[]): CausalEdge[] {
  let edges: CausalEdge[] = canon.edges.map((e) => ({ ...e }));
  for (const iv of interventions) {
    if (iv.kind === "severEdge") {
      edges = edges.filter((e) => e.id !== iv.target);
    } else if (iv.kind === "addEdge") {
      const raw = iv.params?.edge;
      if (raw !== null && typeof raw === "object") {
        const edge = raw as CausalEdge;
        if (
          typeof edge.id === "string" &&
          typeof edge.kind === "string" &&
          typeof edge.from === "string" &&
          typeof edge.to === "string"
        ) {
          edges = edges.filter((e) => e.id !== edge.id);
          edges.push(edge);
        }
      }
    }
  }
  edges.sort(byId);
  return edges;
}

export function buildModel(canon: Canon, interventions: Intervention[]): DerivationModel {
  const edges = resolveEdges(canon, interventions);

  // `declared` = what canon actually SAYS EXISTS (events + facts). It answers
  // "may this node be treated as a root?" — see hardSupport.
  const declared = new Set<string>();
  for (const entity of canon.entities) {
    if (entity.kind === "Event") declared.add(entity.id);
  }
  for (const fact of canon.facts) declared.add(fact.id);

  // The NODE SET is narrower: events, plus only those facts that actually
  // participate in the graph as an edge endpoint, plus intervention targets.
  // Facts that participate in no edge carry no independent status — their
  // presence is already reported by the effective-fact list and the fact diff,
  // so admitting them here would double-count every fact change.
  const nodeSet = new Set<string>();
  for (const entity of canon.entities) {
    if (entity.kind === "Event") nodeSet.add(entity.id);
  }
  for (const edge of edges) {
    nodeSet.add(edge.from);
    nodeSet.add(edge.to);
  }
  for (const iv of interventions) {
    if (iv.kind === "negateEvent" || iv.kind === "forceEvent") nodeSet.add(iv.target);
  }
  const nodeIds = [...nodeSet].sort();

  // REQUIRES grouped by (target, group). An absent `group` defaults to "0", so
  // a canon that never sets it is pure conjunction — the pre-P-003 behaviour.
  const grouped = new Map<string, Map<string, string[]>>();
  const enablesIn = new Map<string, string[]>();
  const precedesEdges: CausalEdge[] = [];
  const excludesEdges: CausalEdge[] = [];
  const invariantEdges: CausalEdge[] = [];

  for (const edge of edges) {
    switch (edge.kind) {
      case "REQUIRES": {
        const groups = grouped.get(edge.to) ?? new Map<string, string[]>();
        const key = edge.group ?? "0";
        const conjuncts = groups.get(key) ?? [];
        conjuncts.push(edge.from);
        groups.set(key, conjuncts);
        grouped.set(edge.to, groups);
        break;
      }
      case "ENABLES": {
        const list = enablesIn.get(edge.to) ?? [];
        list.push(edge.from);
        enablesIn.set(edge.to, list);
        break;
      }
      case "PRECEDES":
        precedesEdges.push(edge);
        break;
      case "EXCLUDES":
        excludesEdges.push(edge);
        break;
      case "INVARIANT":
        invariantEdges.push(edge);
        break;
      case "MOTIVATES":
        // Narrative pressure only. Deliberately inert: it records WHY a
        // character acts, never WHETHER an event is grounded.
        break;
    }
  }

  const supportGroups = new Map<string, SupportGroup[]>();
  for (const [target, groups] of grouped) {
    const list: SupportGroup[] = [...groups.entries()]
      .map(([group, conjuncts]) => ({ group, conjuncts: [...conjuncts].sort() }))
      .sort((a, b) => a.group.localeCompare(b.group));
    supportGroups.set(target, list);
  }
  for (const key of enablesIn.keys()) {
    (enablesIn.get(key) ?? []).sort();
  }

  const negated = new Set<string>();
  const forcedBy = new Map<string, string>();
  for (const iv of interventions) {
    if (iv.kind === "negateEvent") negated.add(iv.target);
    else if (iv.kind === "forceEvent") forcedBy.set(iv.target, iv.id);
  }

  const facts = new Map<string, Fact>();
  for (const fact of canon.facts) {
    if (nodeSet.has(fact.id)) facts.set(fact.id, fact);
  }

  return {
    nodeIds,
    declared,
    supportGroups,
    enablesIn,
    precedesEdges,
    excludesEdges,
    invariantEdges,
    negated,
    forcedBy,
    facts,
  };
}

/** Phase-A truth of a fact-as-constraint node, from its validity window. */
function factWindowTruth(fact: Fact, truth: Map<string, TruthValue>): TruthValue {
  const fromTruth = fact.validFrom === null ? "TRUE" : truth.get(fact.validFrom) ?? "NEITHER";
  const toTruth = fact.validTo === null ? "NEITHER" : truth.get(fact.validTo) ?? "NEITHER";
  // FALSE-dominance: an expired fact is false even if its window opened.
  if (toTruth === "TRUE" || toTruth === "BOTH") return "FALSE";
  if (fromTruth === "TRUE") return "TRUE";
  if (fromTruth === "FALSE") return "FALSE"; // window can never open
  return "NEITHER";
}

/** Hard (REQUIRES) support truth: disjunction over conjunctive sufficient sets. */
function hardSupport(node: string, model: DerivationModel, truth: Map<string, TruthValue>): TruthValue {
  const groups = model.supportGroups.get(node);
  if (groups === undefined || groups.length === 0) {
    // A node with no support rules is a root ONLY if canon declares it. An id
    // that canon merely references (an edge endpoint with no Event entity and no
    // fact) is under-specified: it stays NEITHER forever, so dependents stay
    // UNKNOWN rather than inheriting a fabricated premise (case K).
    return model.declared.has(node) ? "TRUE" : "NEITHER";
  }
  return disjoin(groups.map((g) => conjoin(g.conjuncts.map((c) => truth.get(c) ?? "NEITHER"))));
}

/**
 * Phase A: least fixpoint over {NEITHER, TRUE, FALSE}. Decided values are
 * sticky, so `truthRank` is non-decreasing by construction; the assertion below
 * exists to catch an engine bug, not an expected transition.
 */
function positiveFixpoint(model: DerivationModel): Map<string, TruthValue> {
  const truth = new Map<string, TruthValue>();
  for (const node of model.nodeIds) truth.set(node, "NEITHER");

  const maxPasses = 3 * model.nodeIds.length + 4;
  let pass = 0;
  let changed = true;
  while (changed) {
    if (pass >= maxPasses) {
      // A monotone operator on a finite lattice cannot fail to converge. If we
      // are here the operator is not monotone: a hard error, never a silent exit.
      throw new Error(
        `propagation did not converge within ${maxPasses} passes — the fixpoint operator is not monotone`
      );
    }
    changed = false;
    for (const node of model.nodeIds) {
      const current = truth.get(node) ?? "NEITHER";
      if (current !== "NEITHER") continue; // sticky: already decided

      let next: TruthValue;
      if (model.negated.has(node)) {
        next = "FALSE"; // do(X never happens) is authoritative
      } else {
        const fact = model.facts.get(node);
        const support = fact !== undefined ? factWindowTruth(fact, truth) : hardSupport(node, model, truth);
        if (model.forcedBy.has(node)) {
          // do(X happens) asserts occurrence. A refuted prerequisite makes this
          // a conflict, recorded in Phase D rather than resolved here.
          next = "TRUE";
        } else {
          next = support;
        }
      }

      if (next !== current) {
        if (truthRank(next) < truthRank(current)) {
          throw new Error(
            `non-monotone transition at ${node}: ${current} -> ${next} (information must never be retracted)`
          );
        }
        truth.set(node, next);
        changed = true;
      }
    }
    pass += 1;
  }
  return truth;
}

/**
 * Phase B: greatest unfounded set (well-founded semantics).
 *
 * A still-NEITHER node is unfounded iff EVERY support group contains a conjunct
 * that is itself a still-NEITHER candidate — i.e. its only route to truth runs
 * through a cycle with no external ground. Shrink the candidate set to a
 * fixpoint, then reject the survivors.
 *
 * This is what distinguishes a BOOTSTRAP from genuine UNDER-SPECIFICATION:
 *   - `A REQUIRES B`, `B REQUIRES A`  -> both candidates, each group grounded
 *     only through the other candidate -> both FALSE/UNFOUNDED.
 *   - `C REQUIRES mystery` where `mystery` has no rules and is never asserted:
 *     `mystery` is a candidate, but it has NO support groups, so it is a root
 *     and Phase A already decided it TRUE... which is wrong for an unspecified
 *     entity. Guard: only nodes that ARE canon events or edge targets get root
 *     treatment; an id that appears solely as a conjunct with no rules and no
 *     entity is not a node at all, so `truth.get(c)` yields NEITHER and the
 *     dependent stays NEITHER -> UNKNOWN. Absence of knowledge never becomes
 *     falsehood.
 */
function unfoundedSet(model: DerivationModel, truth: Map<string, TruthValue>): Set<string> {
  let candidates = new Set(model.nodeIds.filter((n) => (truth.get(n) ?? "NEITHER") === "NEITHER"));

  let shrunk = true;
  while (shrunk) {
    shrunk = false;
    for (const node of [...candidates].sort()) {
      const groups = model.supportGroups.get(node);
      if (groups === undefined || groups.length === 0) {
        // No support rules at all: genuinely under-specified, not unfounded.
        candidates.delete(node);
        shrunk = true;
        continue;
      }
      const everyGroupLoops = groups.every((g) =>
        g.conjuncts.some((c) => candidates.has(c))
      );
      if (!everyGroupLoops) {
        // Some group's shortfall is external (an unknown, not a cycle):
        // under-specification, so leave it NEITHER.
        candidates.delete(node);
        shrunk = true;
      }
    }
  }
  return candidates;
}

/** Phase C: ENABLES can raise support to SOFT. It never changes truth. */
function softSupported(node: string, model: DerivationModel, truth: Map<string, TruthValue>): boolean {
  for (const source of model.enablesIn.get(node) ?? []) {
    const t = truth.get(source) ?? "NEITHER";
    if (t === "TRUE" || t === "BOTH") return true;
  }
  return false;
}

/** A conflict detected in Phase D, carrying its provenance. */
export interface ConflictNote {
  node: string;
  kind: "forced-vs-negated" | "forced-vs-refuted" | "excludes" | "invariant";
  other: string;
  /** intervention id, or "canon" for constraint violations */
  source: string;
  edgeId?: string;
}

/**
 * Run the full pipeline. Returns judgments plus the conflicts that produced
 * every BOTH, so contradiction records keep their provenance.
 */
export function propagateJudgments(model: DerivationModel): {
  judgments: Map<string, Judgment>;
  conflicts: ConflictNote[];
} {
  const truth = positiveFixpoint(model);
  const unfounded = unfoundedSet(model, truth);
  for (const node of unfounded) truth.set(node, "FALSE");

  const conflicts: ConflictNote[] = [];

  // Phase D.1 — intervention conflicts.
  for (const node of model.nodeIds) {
    const forceId = model.forcedBy.get(node);
    if (forceId === undefined) continue;
    if (model.negated.has(node)) {
      conflicts.push({ node, kind: "forced-vs-negated", other: node, source: forceId });
      continue;
    }
    const fact = model.facts.get(node);
    const support = fact !== undefined ? factWindowTruth(fact, truth) : hardSupport(node, model, truth);
    if (support === "FALSE") {
      // Name the refuted prerequisite for the record (first refuted conjunct,
      // sorted, across the sorted groups — deterministic).
      let culprit = node;
      for (const group of model.supportGroups.get(node) ?? []) {
        const bad = group.conjuncts.find((c) => {
          const t = truth.get(c) ?? "NEITHER";
          return t === "FALSE" || t === "BOTH";
        });
        if (bad !== undefined) {
          culprit = bad;
          break;
        }
      }
      conflicts.push({ node, kind: "forced-vs-refuted", other: culprit, source: forceId });
    }
  }

  const occursNow = (node: string): boolean => {
    const t = truth.get(node) ?? "NEITHER";
    return t === "TRUE" || t === "BOTH";
  };

  // Phase D.2 — EXCLUDES: symmetric. Both occurring is the world asserting an
  // impossibility, so both endpoints are contradictory. (EXCLUDED is reserved
  // for "an intervention removed it" — a different thing entirely.)
  for (const edge of model.excludesEdges) {
    if (occursNow(edge.from) && occursNow(edge.to)) {
      conflicts.push({ node: edge.from, kind: "excludes", other: edge.to, source: "canon", edgeId: edge.id });
      conflicts.push({ node: edge.to, kind: "excludes", other: edge.from, source: "canon", edgeId: edge.id });
    }
  }

  // Phase D.3 — INVARIANT: directed. The target carries the violation; the
  // rule-triggering source is not tainted.
  for (const edge of model.invariantEdges) {
    if (occursNow(edge.from) && occursNow(edge.to)) {
      conflicts.push({ node: edge.to, kind: "invariant", other: edge.from, source: "canon", edgeId: edge.id });
    }
  }

  const conflicted = new Set(conflicts.map((c) => c.node));

  const judgments = new Map<string, Judgment>();
  for (const node of model.nodeIds) {
    const base = truth.get(node) ?? "NEITHER";
    const finalTruth: TruthValue = conflicted.has(node) ? joinTruth(base, base === "TRUE" ? "FALSE" : "TRUE") : base;

    let support: SupportKind;
    if (model.negated.has(node)) support = "NONE";
    else if (unfounded.has(node)) support = "UNFOUNDED";
    else if (base === "TRUE") support = "HARD";
    else if (base === "NEITHER" && softSupported(node, model, truth)) support = "SOFT";
    else support = "NONE";

    judgments.set(node, {
      truth: finalTruth,
      support,
      forced: model.forcedBy.has(node),
      negated: model.negated.has(node),
    });
  }

  conflicts.sort((a, b) => {
    const ka = `${a.node}|${a.kind}|${a.other}|${a.edgeId ?? ""}`;
    const kb = `${b.node}|${b.kind}|${b.other}|${b.edgeId ?? ""}`;
    return ka.localeCompare(kb);
  });

  return { judgments, conflicts };
}

/**
 * PRECEDES consistency. A violation is a cycle among nodes that occur: the
 * timeline cannot be linearized. PRECEDES contributes NOTHING to any judgment —
 * "A precedes B" never means "A causes B".
 */
export function temporalViolations(
  model: DerivationModel,
  judgments: Map<string, Judgment>
): TemporalViolation[] {
  const live = model.precedesEdges.filter((e) => {
    const a = judgments.get(e.from);
    const b = judgments.get(e.to);
    return a !== undefined && b !== undefined && occurs(a) && occurs(b);
  });

  const adjacency = new Map<string, { to: string; edgeId: string }[]>();
  for (const edge of live) {
    const list = adjacency.get(edge.from) ?? [];
    list.push({ to: edge.to, edgeId: edge.id });
    adjacency.set(edge.from, list);
  }
  for (const list of adjacency.values()) {
    list.sort((a, b) => a.to.localeCompare(b.to));
  }

  const violations: TemporalViolation[] = [];
  const seen = new Set<string>();
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  const stackEdges: string[] = [];

  const visit = (node: string): void => {
    state.set(node, "open");
    stack.push(node);
    for (const { to, edgeId } of adjacency.get(node) ?? []) {
      stackEdges.push(edgeId);
      if (state.get(to) === "open") {
        const start = stack.indexOf(to);
        const cycleNodes = stack.slice(start).sort();
        const cycleEdges = [...new Set(stackEdges.slice(start))].sort();
        const key = `${cycleNodes.join(",")}|${cycleEdges.join(",")}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            edgeIds: cycleEdges,
            nodes: cycleNodes,
            detail: `PRECEDES cycle among occurring events: ${cycleNodes.join(" -> ")}`,
          });
        }
      } else if (state.get(to) === undefined) {
        visit(to);
      }
      stackEdges.pop();
    }
    stack.pop();
    state.set(node, "done");
  };

  for (const node of [...adjacency.keys()].sort()) {
    if (state.get(node) === undefined) visit(node);
  }

  violations.sort((a, b) => a.nodes.join(",").localeCompare(b.nodes.join(",")));
  return violations;
}
