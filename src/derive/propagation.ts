/**
 * Somnium Engine — causal propagation (P-003 rewrite).
 *
 * WHY THIS WAS REWRITTEN. The adversarial pass confirmed six defects in the
 * P-001/P-002 causal model (full list in docs/ARCHITECTURE-RECONNAISSANCE.md
 * §17.1). Four of them were in this module:
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
 * The other two were elsewhere: a bootstrap cycle reported as UNKNOWN (fixed
 * here, in Phase B) and `causalReach` misnamed (src/depth).
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
import type { FactAssertionError, FactVocabulary } from "../canon/fact-rules";
import { buildFactVocabulary, factAssertionError } from "../canon/fact-rules";
import { canonicalJson, sameCanonicalValue } from "../canon/hash";
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
  /**
   * The declared vocabulary a fact assertion may draw on (P-005/ncr-004).
   *
   * Held here so `buildModel` and `applyFactInterventions` decide fact-write
   * legality with the SAME function `validateCanon` uses — see
   * `src/canon/fact-rules.ts`. The invariant is differential: **an intervention
   * may assert no more than canon may.**
   */
  factVocabulary: FactVocabulary;
  /**
   * `setFact`/`relocate` interventions rejected because the fact they would
   * write would be illegal as canon. Rejected, not applied, and reported as a
   * contradiction — never silently dropped.
   */
  rejectedFactWrites: {
    subject: string;
    predicate: string;
    source: string;
    error: FactAssertionError;
  }[];
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
  /**
   * Fact ids a `retractFact` intervention removed (P-004). The fact does not
   * hold in this world, so its node is FALSE — authoritative, like `negated`.
   */
  retracted: Set<string>;
  /**
   * `subject|predicate` -> the object a `setFact`/`relocate` intervention wrote
   * last (P-004). A canon fact node for that cell whose object differs no longer
   * holds, so its node is FALSE.
   */
  overriddenCells: Map<string, string | number | boolean | null>;
  /**
   * The FULL resolved edge set (canon edges after severEdge/addEdge, in order),
   * sorted by id (P-007). The world's effective causal LAW: the individual
   * buckets below are views over it for propagation, but the whole set is the
   * world-semantic surface — "the oath happens BECAUSE of the blight" vs "the
   * oath is uncaused" are different worlds even when every verdict coincides.
   */
  edges: CausalEdge[];
}

/**
 * Cell key for a fact's (subject, predicate) — the unit a setFact writes to.
 *
 * INJECTIVE BY ENCODING, not by character assumption (P-007 gate 4, blocker 3):
 * `canonicalJson([subject, predicate])` is injective over arbitrary strings —
 * JSON escaping handles NUL, quotes, backslashes, anything — so no undocumented
 * "this character cannot appear in an id" premise remains. The previous NUL
 * separator was injective only while nothing put a NUL in an id, which nothing
 * enforced. `overrideFact` mints the synthetic fact id from this same key, and
 * `buildModel`'s `overriddenCells` map is keyed by it: one implementation, and
 * the fact list's id-keyed consumers downstream cannot see two cells collide.
 */
export function cellKey(subject: string, predicate: string): string {
  return canonicalJson([subject, predicate]);
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/** Edge set after severEdge/addEdge interventions, applied in order. */
function resolveEdges(canon: Canon, interventions: Intervention[], changedOut?: boolean[]): CausalEdge[] {
  let edges: CausalEdge[] = canon.edges.map((e) => ({ ...e }));
  for (let i = 0; i < interventions.length; i++) {
    const iv = interventions[i]!;
    if (iv.kind === "severEdge") {
      const n = edges.length;
      edges = edges.filter((e) => e.id !== iv.target);
      // S011: observe whether THIS step changed the fold's edge set.
      if (changedOut !== undefined) changedOut[i] = edges.length !== n;
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
          // P-007 gate 3: `params` is `Record<string, unknown>`, so a non-string
          // `group` can reach here from an intervention literal. `supportGroups`
          // then calls `group.localeCompare` and THROWS. Guard it at the same
          // boundary as the other four fields: keep a string, otherwise omit the
          // key so the edge falls back to the default group.
          const guarded: CausalEdge = { ...edge };
          if (typeof guarded.group !== "string") delete guarded.group;
          const prev = edges.find((e) => e.id === guarded.id);
          const same = prev !== undefined && canonicalJson(prev) === canonicalJson(guarded);
          edges = edges.filter((e) => e.id !== guarded.id);
          edges.push(guarded);
          // S011: a re-add of an identical edge is a no-op for the edge fold.
          if (changedOut !== undefined) changedOut[i] = !same;
        }
      }
    }
  }
  edges.sort(byId);
  return edges;
}

/**
 * S011 — per-intervention fold-state delta.
 *
 * `components` names the fold-state parts THIS intervention changed. An empty
 * `components` array means the fold's own state was untouched by this step, so
 * the step cannot influence any later step's derivation. The delta is produced
 * BY the fold — recorded as the accumulators are updated — not by a separate
 * semantic reducer.
 */
export interface FoldStepDelta {
  index: number;
  kind: string;
  target: string;
  components: string[];
}

export function buildModel(canon: Canon, interventions: Intervention[]): DerivationModel {
  return buildModelInternal(canon, interventions, undefined);
}

/** S011: the same fold, additionally reporting a per-intervention delta. */
export function buildModelWithDeltas(
  canon: Canon,
  interventions: Intervention[]
): { model: DerivationModel; deltas: FoldStepDelta[] } {
  const deltas: FoldStepDelta[] = [];
  const model = buildModelInternal(canon, interventions, deltas);
  return { model, deltas };
}

function buildModelInternal(
  canon: Canon,
  interventions: Intervention[],
  deltas: FoldStepDelta[] | undefined
): DerivationModel {
  const edgeChanged = deltas === undefined ? undefined : new Array<boolean>(interventions.length).fill(false);
  const edges = resolveEdges(canon, interventions, edgeChanged);

  // `declared` = what canon actually SAYS EXISTS (events + facts). It answers
  // "may this node be treated as a root?" — see hardSupport.
  const declared = new Set<string>();
  for (const entity of canon.entities) {
    if (entity.kind === "Event") declared.add(entity.id);
  }
  for (const fact of canon.facts) declared.add(fact.id);

  // The declared vocabulary a fact assertion may draw on. Owned by
  // src/canon/fact-rules.ts so `validateCanon` and the intervention path decide
  // legality with the SAME function — the invariant is differential: an
  // intervention may assert no more than canon may (ncr-004).
  const factVocabulary = buildFactVocabulary(canon);

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
  const retracted = new Set<string>();
  const overriddenCells = new Map<string, string | number | boolean | null>();
  const rejectedFactWrites: DerivationModel["rejectedFactWrites"] = [];
  for (let i = 0; i < interventions.length; i++) {
    const iv = interventions[i]!;
    // S011: `components` records which fold-state parts THIS step changed, as
    // the fold itself performs them. This is an observation of the fold, not a
    // second implementation of it.
    const components: string[] = [];
    if (iv.kind === "negateEvent") {
      if (!negated.has(iv.target)) {
        negated.add(iv.target);
        components.push("negated");
      }
    } else if (iv.kind === "forceEvent") {
      const prev = forcedBy.get(iv.target);
      forcedBy.set(iv.target, iv.id);
      if (prev !== iv.id) components.push("forcedBy");
    } else if (iv.kind === "retractFact") {
      if (!retracted.has(iv.target)) {
        retracted.add(iv.target);
        components.push("retracted");
      }
    } else if (iv.kind === "setFact" || iv.kind === "relocate") {
      // Applied IN ORDER, so the last write to a cell wins — matching
      // applyFactInterventions in world-state.ts, which owns the effective
      // fact list. These two views of "does this fact hold" must agree.
      const predicate = iv.kind === "setFact" ? iv.params?.predicate : "located_in";
      const object = iv.kind === "setFact" ? iv.params?.object : iv.params?.to;
      if (typeof predicate === "string") {
        const value = (object ?? null) as string | number | boolean | null;
        // The SAME function `validateCanon` uses (src/canon/fact-rules.ts), so an
        // intervention may assert no more than canon may. Shared with
        // world-state.ts's effective-fact list: two views of one fact.
        const error = factAssertionError(iv.target, predicate, value, factVocabulary);
        if (error !== null) {
          rejectedFactWrites.push({
            subject: iv.target,
            predicate,
            source: iv.id,
            error,
          });
          components.push("rejectedFactWrites");
        } else {
          const key = cellKey(iv.target, predicate);
          const prev = overriddenCells.get(key);
          overriddenCells.set(key, value);
          if (!sameCanonicalValue(prev, value)) components.push("overriddenCells");
        }
      }
    }
    if (deltas !== undefined) {
      if (edgeChanged?.[i] === true) components.push("edges");
      deltas.push({ index: i, kind: iv.kind, target: iv.target, components });
    }
  }

  const facts = new Map<string, Fact>();
  for (const fact of canon.facts) {
    if (nodeSet.has(fact.id)) facts.set(fact.id, fact);
  }

  return {
    nodeIds,
    declared,
    factVocabulary,
    rejectedFactWrites,
    supportGroups,
    enablesIn,
    precedesEdges,
    excludesEdges,
    invariantEdges,
    negated,
    forcedBy,
    facts,
    retracted,
    overriddenCells,
    edges,
  };
}

/**
 * Phase-A truth of a fact-as-constraint node.
 *
 * Two sources, in precedence order:
 *
 *   1. FACT-LEVEL INTERVENTIONS (P-004). A `retractFact` removes the fact, and a
 *      `setFact`/`relocate` that writes a DIFFERENT object to the same
 *      (subject, predicate) cell replaces it. Either way the canon fact no
 *      longer holds, so its node is FALSE — authoritative, exactly as
 *      `negateEvent` is for an event.
 *
 *      This was a P-004 defect. `buildModel` collected only negate/force, so a
 *      fact node's truth came solely from its validity window and an event
 *      REQUIRING a fact was unaffected by retracting or overwriting that fact.
 *      The effective-fact list (world-state.ts) and the causal graph disagreed
 *      about whether the same fact held. Verrin never noticed because its one
 *      fact-sourced REQUIRES edge is a deliberate dead end; Ordos gates a rite
 *      on who holds the Seal, so the disagreement became visible immediately.
 *
 *   2. The validity window over event truth, when no intervention touched it.
 */
function factNodeTruth(
  fact: Fact,
  model: DerivationModel,
  truth: Map<string, TruthValue>
): TruthValue {
  if (model.retracted.has(fact.id)) return "FALSE";

  const cell = cellKey(fact.subject, fact.predicate);
  if (model.overriddenCells.has(cell)) {
    // An override to this cell displaces every canon fact for it except one
    // asserting the same object (writing the same value changes nothing).
    //
    // `sameCanonicalValue`, never `!==` (P-007 gate 2). This truth feeds
    // `statuses`, a semanticState dimension, so a comparison that disagrees
    // with the canonical encoding would put a wrong value into world identity.
    // Currently unreachable for non-finite values because `factAssertionError`
    // refuses them at the write boundary — converted anyway, in the same pass
    // as the `workStatuses` comparison, because relying on the input layer to
    // keep a comparison honest is what produced the defect in the first place.
    const written = model.overriddenCells.get(cell);
    if (!sameCanonicalValue(written, fact.object)) return "FALSE";
  }

  return factWindowTruth(fact, truth);
}

/** Truth of a fact node from its narrative-time validity window alone. */
function factWindowTruth(fact: Fact, truth: Map<string, TruthValue>): TruthValue {
  const fromTruth = fact.validFrom === null ? "TRUE" : truth.get(fact.validFrom) ?? "NEITHER";
  const toTruth = fact.validTo === null ? "NEITHER" : truth.get(fact.validTo) ?? "NEITHER";
  // FALSE-dominance: an expired fact is false even if its window opened.
  if (toTruth === "TRUE" || toTruth === "BOTH") return "FALSE";
  if (fromTruth === "TRUE") return "TRUE";
  if (fromTruth === "FALSE") return "FALSE"; // window can never open
  return "NEITHER";
}

/**
 * Hard (REQUIRES) support truth: disjunction over conjunctive sufficient sets.
 *
 * THE DECLARED GATE APPLIES IN BOTH DIRECTIONS (P-005). An id canon never
 * declared can never be TRUE, no matter what edges point at it. Nothing SE can
 * infer brings an occurrence into existence; only canon declares one.
 *
 * This was a defect until P-005's second pass. The gate lived only in the
 * no-support-rules branch, which covered an undeclared REQUIRES *source*
 * (dependents correctly stayed UNKNOWN — case K) but not an undeclared
 * *target*: an `addEdge` intervention naming a fresh id gave that id support
 * rules, so it fell through to `disjoin` and inherited its prerequisite's truth.
 * Measured before the fix:
 *
 *     addEdge({ REQUIRES, from: ev/real, to: ev/ghost })
 *       -> ev/ghost ESTABLISHED, support HARD, 0 contradictions
 *
 * and it chained — three added edges produced three invented occurrences, which
 * then joined an EventType and were counted by the occurrence layer. Exactly the
 * "silently manufacture infinite fictional history" the occurrence generation
 * rule forbids.
 */
function hardSupport(node: string, model: DerivationModel, truth: Map<string, TruthValue>): TruthValue {
  // An undeclared id is under-specified, full stop: it stays NEITHER forever, so
  // dependents stay UNKNOWN rather than inheriting a fabricated premise.
  if (!model.declared.has(node)) return "NEITHER";

  const groups = model.supportGroups.get(node);
  if (groups === undefined || groups.length === 0) {
    return "TRUE"; // declared with no prerequisites: a root
  }
  return disjoin(groups.map((g) => conjoin(g.conjuncts.map((c) => truth.get(c) ?? "NEITHER"))));
}

/**
 * Phase A: least fixpoint over {NEITHER, TRUE, FALSE}. Decided values are
 * sticky, so `truthRank` is non-decreasing by construction; the assertion below
 * exists to catch an engine bug, not an expected transition.
 */
/**
 * S016 — per-stage re-evaluation footprint of the authoritative propagation.
 *
 *   considered ⊇ recomputed ⊇ changed
 *
 * `considered` = nodes inspected by the stage's scan (global stages touch all).
 * `recomputed` = nodes for which the stage actually re-evaluated a judgment.
 * `changed`    = nodes whose resulting value differs from the stage's prior value.
 *
 * The footprint OBSERVES the existing algorithm; it does not alter evaluation.
 */
export interface StageFootprint {
  considered: number;
  recomputed: number;
  changed: number;
  iterations: number;
  globalScan: boolean;
  changedNodes: string[];
}

function newFootprint(globalScan: boolean): StageFootprint {
  return { considered: 0, recomputed: 0, changed: 0, iterations: 0, globalScan, changedNodes: [] };
}

/**
 * S016 — run the authoritative propagation and additionally report its
 * per-stage re-evaluation footprint. Semantics are unchanged: this is the same
 * `propagateJudgments` with an observation sink attached.
 */
export function propagateJudgmentsWithFootprint(model: DerivationModel): {
  judgments: Map<string, Judgment>;
  conflicts: ConflictNote[];
  footprint: PropagationFootprint;
} {
  const footprint: PropagationFootprint = { phaseA: newFootprint(true), phaseB: newFootprint(true), unfounded: [] };
  const result = propagateJudgments(model, footprint);
  return { ...result, footprint };
}

function positiveFixpoint(model: DerivationModel, fp?: StageFootprint): Map<string, TruthValue> {
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
      if (fp !== undefined) fp.considered++;
      const current = truth.get(node) ?? "NEITHER";
      if (current !== "NEITHER") continue; // sticky: already decided
      if (fp !== undefined) fp.recomputed++;

      let next: TruthValue;
      if (model.negated.has(node)) {
        next = "FALSE"; // do(X never happens) is authoritative
      } else {
        const fact = model.facts.get(node);
        const support = fact !== undefined ? factNodeTruth(fact, model, truth) : hardSupport(node, model, truth);
        if (model.forcedBy.has(node)) {
          // do(X happens) asserts occurrence. A refuted prerequisite makes this
          // a conflict, recorded in Phase D rather than resolved here.
          //
          // P-005: but forcing cannot bring an UNDECLARED occurrence into
          // existence, so the `declared` gate applies here too. An undeclared
          // forced id is FALSE — the world does not contain it — and Phase D
          // records a `forced-undeclared` contradiction naming the incoherent
          // intervention. The contradiction lives in the records, not in the
          // truth value.
          //
          // An earlier pass set TRUE here and let Phase D join it to BOTH. That
          // looked right (status CONTRADICTORY) but was wrong where it mattered:
          // `occurs()` accepts BOTH, so the invented occurrence was counted by
          // `occurrenceCount`, joined an `EventType`, and opened the validity
          // window of any canon fact anchored to it — an id canon never declared
          // writing world state. Found by the second L2 gate (ncr-004).
          next = model.declared.has(node) || model.facts.has(node) ? "TRUE" : "FALSE";
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
        if (fp !== undefined) {
          fp.changed++;
          fp.changedNodes.push(node);
        }
        changed = true;
      }
    }
    pass += 1;
  }
  if (fp !== undefined) fp.iterations = pass;
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
function unfoundedSet(model: DerivationModel, truth: Map<string, TruthValue>, fp?: StageFootprint): Set<string> {
  let candidates = new Set(model.nodeIds.filter((n) => (truth.get(n) ?? "NEITHER") === "NEITHER"));
  if (fp !== undefined) fp.considered = candidates.size;

  let shrunk = true;
  let iters = 0;
  while (shrunk) {
    shrunk = false;
    iters++;
    for (const node of [...candidates].sort()) {
      if (fp !== undefined) fp.recomputed++;
      const groups = model.supportGroups.get(node);
      if (groups === undefined || groups.length === 0) {
        // No support rules at all: genuinely under-specified, not unfounded.
        candidates.delete(node);
        if (fp !== undefined) {
          fp.changed++;
          fp.changedNodes.push(node);
        }
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
        if (fp !== undefined) {
          fp.changed++;
          fp.changedNodes.push(node);
        }
        shrunk = true;
      }
    }
  }
  if (fp !== undefined) fp.iterations = iters;
  return candidates;
}

/**
 * Phase C: ENABLES can raise support to SOFT. It never changes truth.
 *
 * The `declared` gate applies here too (P-005). Soft support is a claim that a
 * node is *reachable by an enabling path*, which is only meaningful for a node
 * canon declares. Without this, `addEdge({ENABLES, from: <declared>, to:
 * <undeclared>})` reported the invented id as CONTINGENT — truth still NEITHER,
 * so it could not occur or be counted, but the projection implied it was a real
 * candidate for occurrence. UNKNOWN is the honest answer for something canon
 * never mentions.
 */
function softSupported(node: string, model: DerivationModel, truth: Map<string, TruthValue>): boolean {
  if (!model.declared.has(node)) return false;
  for (const source of model.enablesIn.get(node) ?? []) {
    const t = truth.get(source) ?? "NEITHER";
    if (t === "TRUE" || t === "BOTH") return true;
  }
  return false;
}

/**
 * Apply a conflict to a node's truth: a conflict may only ever CONTRADICT A
 * DECIDED VALUE, never decide an undecided one (P-005 guard B).
 *
 * `BOTH` means "this world asserts P and ¬P", which is meaningless until the
 * world has asserted something — so `taintTruth("NEITHER")` is `NEITHER`.
 *
 * EXPORTED only so its unit behaviour can be pinned. `derive` cannot currently
 * reach the `NEITHER` branch (see the discipline block in `propagateJudgments`),
 * so a test through `derive` would give it no coverage at all.
 */
export function taintTruth(base: TruthValue): TruthValue {
  return base === "NEITHER" ? "NEITHER" : joinTruth(base, base === "TRUE" ? "FALSE" : "TRUE");
}

/**
 * Conflict kinds that describe an INCOHERENT INTERVENTION rather than an
 * inconsistent world. They are reported as records and never touch truth: the
 * world did not assert anything contradictory, the caller asked for something
 * the canon cannot express.
 *
 * EXPORTED so a test can assert the classification is TOTAL over
 * `ConflictNote["kind"]` — a new kind added to the union without being
 * classified is the enumeration failure ncr-004 is about.
 */
export const ABOUT_THE_INTERVENTION: ReadonlySet<ConflictNote["kind"]> = new Set([
  "forced-undeclared",
  "fact-write-illegal",
]);

/** Conflict kinds that describe an inconsistent WORLD, and so do taint truth. */
export const ABOUT_THE_WORLD: ReadonlySet<ConflictNote["kind"]> = new Set([
  "forced-vs-negated",
  "forced-vs-refuted",
  "excludes",
  "invariant",
]);
export interface ConflictNote {
  node: string;
  kind:
    | "forced-vs-negated"
    | "forced-vs-refuted"
    /**
     * P-005: do(X happens) named an occurrence canon never declared. An
     * intervention may change an occurrence's status; it may never bring one
     * into existence.
     */
    | "forced-undeclared"
    /**
     * P-005/ncr-004: `setFact`/`relocate` would have written a fact that is
     * ILLEGAL AS CANON — an undeclared subject, an unresolvable id-shaped object,
     * or an `instance_of` outside its Event -> EventType signature.
     *
     * ONE kind, not one per rule. An earlier pass had a `-subject` and a
     * `-object` kind, and the `-object` case was unreachable because Phase D.0
     * hardcoded the other — a dead branch that made the docs promise a record the
     * code could not emit. The specific rule lives in `FactAssertionError.reason`,
     * which `contradictions.ts` renders into the detail text, so adding a rule
     * needs no new kind and cannot silently produce an unreachable one.
     */
    | "fact-write-illegal"
    | "excludes"
    | "invariant";
  other: string;
  /** intervention id, or "canon" for constraint violations */
  source: string;
  edgeId?: string;
  /** why a fact write was refused; present only for `fact-write-illegal` */
  factError?: FactAssertionError;
}

/**
 * Run the full pipeline. Returns judgments plus the conflicts that produced
 * every BOTH, so contradiction records keep their provenance.
 */
export interface PropagationFootprint {
  phaseA: StageFootprint;
  phaseB: StageFootprint;
  unfounded: string[];
}

export function propagateJudgments(model: DerivationModel, footprint?: PropagationFootprint): {
  judgments: Map<string, Judgment>;
  conflicts: ConflictNote[];
} {
  const truth = positiveFixpoint(model, footprint?.phaseA);
  const unfounded = unfoundedSet(model, truth, footprint?.phaseB);
  if (footprint !== undefined) footprint.unfounded = [...unfounded].sort();
  for (const node of unfounded) truth.set(node, "FALSE");

  const conflicts: ConflictNote[] = [];

  // Phase D.0 — fact writes rejected at model-build time (P-005/ncr-004).
  // `setFact`/`relocate` naming a subject canon never declares. Reported, never
  // silently dropped: the intervention was incoherent, and a caller who asked
  // for it must be told.
  for (const write of model.rejectedFactWrites) {
    conflicts.push({
      node: write.subject,
      kind: "fact-write-illegal",
      other: write.predicate,
      source: write.source,
      factError: write.error,
    });
  }

  // Phase D.1 — intervention conflicts.
  for (const node of model.nodeIds) {
    const forceId = model.forcedBy.get(node);
    if (forceId === undefined) continue;

    // P-005: forcing an occurrence canon never declared. Checked FIRST, before
    // negation and before support, because non-existence is the primary defect:
    // an incoherent intervention about a thing that is not in the world is not
    // usefully described as "forced and also negated". Checking `negated` first
    // (an earlier pass did) emitted `forced-vs-negated` instead, which taints
    // truth to BOTH — see the invariant below.
    const isFact = model.facts.has(node);
    if (!isFact && !model.declared.has(node)) {
      conflicts.push({ node, kind: "forced-undeclared", other: node, source: forceId });
      continue;
    }
    if (model.negated.has(node)) {
      conflicts.push({ node, kind: "forced-vs-negated", other: node, source: forceId });
      continue;
    }
    const fact = model.facts.get(node);
    const support = fact !== undefined ? factNodeTruth(fact, model, truth) : hardSupport(node, model, truth);
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

  /**
   * THE UNDECLARED INVARIANT (P-005), and the TAINT DISCIPLINE that carries it.
   *
   * Two rules, both predicates rather than lists of conflict kinds.
   *
   * (A) `cannotBeTainted` — no conflict about an id canon never declared may
   *     lift its truth above FALSE. Canon defines the vocabulary, so nothing an
   *     intervention says can put a thing canon never mentioned into the world.
   *
   * (B) `taint` — a conflict may only ever CONTRADICT A DECIDED VALUE. It may
   *     never decide an undecided one. `BOTH` means "this world asserts P and
   *     ¬P", which is only meaningful once the world has asserted something.
   *
   * (B) exists because (A) was not enough, and the way it failed is the most
   *     instructive moment in this whole sequence. Route 8: a *refused* fact
   *     write pushed a `fact-write-illegal` note whose node is the write's
   *     SUBJECT. That subject is usually declared, so (A) correctly let it into
   *     the taint set — and the old taint expression,
   *
   *         joinTruth(base, base === "TRUE" ? "FALSE" : "TRUE")
   *
   *     evaluated to joinTruth("NEITHER", "TRUE") = TRUE for a dormant node.
   *     A rejected intervention therefore PROMOTED a dormant declared event to
   *     ESTABLISHED. Measured on shipped Ordos:
   *     `setFact("ev/galen-invested", instance_of, "phantomtype")` — a write the
   *     engine refuses — moved `ev/galen-invested` UNKNOWN -> ESTABLISHED,
   *     inflated `occurrenceCount("type/investiture")` 1 -> 2, opened
   *     `fact/seal-held-galen` so both Seal holders were effective at once, and
   *     did NOT report the canon `EXCLUDES` violation (the fact NODE stayed
   *     NEITHER, so Phase D.2's `occursNow` never fired). 150 refused writes
   *     across the three shipped canons changed world state.
   *
   * Fixing only the kind would have been the ncr-004 mistake for the seventh
   * time. (B) is a property of the taint operation itself, so it holds for every
   * present and future conflict kind, on declared and undeclared nodes alike.
   * A rejection is additionally NOT a conflict about the world — it is a refused
   * intervention — so it is also excluded from tainting by name below.
   *
   * THE TWO GUARDS ARE NOT SYMMETRIC, and an earlier draft of this comment
   * claimed they were ("two independent guards, either sufficient"). Mutation
   * testing by the seventh L2 gate measured otherwise:
   *
   *   - name list removed, (B) kept  ->  114 of 264 refused writes still move
   *     world state. (B) stops route 8 proper (0 dormant promotions, 0 count
   *     changes) but not a refused write tainting an already-DECIDED subject,
   *     e.g. verrin `ev/ashfall-falls` TRUE -> BOTH, flipping
   *     `work/verrin-ashfall` PRESERVED -> IMPOSSIBLE.
   *   - (B) removed, name list kept  ->  0 world moves across the same 264.
   *
   * So `ABOUT_THE_INTERVENTION` is the LOAD-BEARING guard and (B) is a narrower
   * BACKSTOP. (B) is currently unreachable through `derive` — the gate made
   * `taint(NEITHER)` throw and found 0 hits across 4,386 derivations, because
   * the four world-level kinds gate on `occursNow`/`forcedBy`, which decide a
   * node before any conflict about it can fire. It is kept deliberately: it
   * makes the taint operation sound on its own terms, and it is the defence if a
   * future conflict kind's predicate does NOT imply a decided node. Its unit
   * behaviour is pinned directly in `taint.test.ts`, since `derive` cannot reach
   * it.
   */
  const cannotBeTainted = (node: string): boolean =>
    !model.declared.has(node) && !model.facts.has(node);

  const conflicted = new Set(
    conflicts
      .filter((c) => !ABOUT_THE_INTERVENTION.has(c.kind) && !cannotBeTainted(c.node))
      .map((c) => c.node)
  );

  const judgments = new Map<string, Judgment>();
  for (const node of model.nodeIds) {
    const base = truth.get(node) ?? "NEITHER";
    const finalTruth: TruthValue = conflicted.has(node) ? taintTruth(base) : base;

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
