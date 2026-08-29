/**
 * Somnium Engine — monotone fixpoint propagation over the causal graph.
 *
 * The derive core: given the post-intervention model (nodes, edges, pre-marks),
 * iterate node statuses to a fixpoint. Iteration runs in SORTED entity-id order
 * so the result is deterministic: same canon + same interventions => identical
 * status map.
 *
 * Lattice (src/derive/lattice.ts): UNKNOWN < UNSUPPORTED < CONTINGENT <
 * ESTABLISHED, EXCLUDED incomparable with ESTABLISHED, CONTRADICTORY on top.
 *
 * Rules evaluated per node, per pass:
 *   - REQUIRES:  ESTABLISHED iff forced, OR root (no REQUIRES sources), OR all
 *                REQUIRES sources ESTABLISHED. Any source EXCLUDED/UNSUPPORTED
 *                or CONTRADICTORY (tainted) => UNSUPPORTED.
 *                Special case: a FORCED event whose REQUIRES source is EXCLUDED
 *                joins to CONTRADICTORY (the intervention asserts an impossible
 *                event).
 *   - ENABLES:   soft access only — when the hard path is unresolved, an
 *                ESTABLISHED ENABLES source makes the target CONTINGENT; a
 *                blocked ENABLES source degrades it to UNSUPPORTED.
 *   - EXCLUDES:  symmetric mutual exclusion — both endpoints holding
 *                (ESTABLISHED or already CONTRADICTORY) => CONTRADICTORY.
 *   - INVARIANT: directed prohibition — source holding and target holding
 *                => target CONTRADICTORY.
 *   - Pre-marks: negated events are authoritatively EXCLUDED (they never
 *                happen; canon-side prerequisites do not re-establish them);
 *                forced events are ESTABLISHED and join with the graph result.
 *
 * Fact nodes (facts referenced by an edge) derive their status from their
 * validity window over event statuses; they participate in the same fixpoint.
 */
import type { Canon, CausalEdge, Fact } from "../canon/types";
import type { Intervention } from "../timeline/types";
import type { EventStatus } from "./lattice";
import { joinStatuses } from "./lattice";

/** The post-intervention causal model the fixpoint runs over. */
export interface DerivationModel {
  /** All nodes (events + facts referenced by edges + negate/force targets), sorted. */
  nodeIds: string[];
  /** node id -> sorted REQUIRES source ids */
  requiresIn: Map<string, string[]>;
  /** node id -> sorted ENABLES source ids */
  enablesIn: Map<string, string[]>;
  /** EXCLUDES edges, sorted by id */
  excludesEdges: CausalEdge[];
  /** INVARIANT edges, sorted by id */
  invariantEdges: CausalEdge[];
  /** node id -> intervention pre-mark (EXCLUDED | ESTABLISHED | CONTRADICTORY) */
  preMarks: Map<string, EventStatus>;
  /** node id -> canon fact, for fact nodes participating in the graph */
  facts: Map<string, Fact>;
  /** node id -> intervention id that forced it (for contradiction records) */
  forcedBy: Map<string, string>;
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

const ESTABLISHEDISH: ReadonlySet<EventStatus> = new Set(["ESTABLISHED", "CONTRADICTORY"]);
const BLOCKED: ReadonlySet<EventStatus> = new Set(["EXCLUDED", "UNSUPPORTED", "CONTRADICTORY"]);

/**
 * Build the post-intervention model: sever/add edges applied in intervention
 * order, pre-marks collected, adjacency maps assembled. All lists sorted.
 */
export function buildModel(canon: Canon, interventions: Intervention[]): DerivationModel {
  // 1. Post-intervention edge set (sever / add applied in order).
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

  // 2. Node set: every canon event + every edge endpoint + negate/force targets.
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

  // 3. Pre-marks from interventions (order-independent: both sets accumulate).
  const negated = new Set<string>();
  const forcedBy = new Map<string, string>();
  for (const iv of interventions) {
    if (iv.kind === "negateEvent") negated.add(iv.target);
    else if (iv.kind === "forceEvent") forcedBy.set(iv.target, iv.id);
  }
  const preMarks = new Map<string, EventStatus>();
  for (const node of nodeIds) {
    const isNegated = negated.has(node);
    const isForced = forcedBy.has(node);
    if (isNegated && isForced) preMarks.set(node, "CONTRADICTORY");
    else if (isNegated) preMarks.set(node, "EXCLUDED");
    else if (isForced) preMarks.set(node, "ESTABLISHED");
  }

  // 4. Adjacency, grouped by edge kind.
  const requiresIn = new Map<string, string[]>();
  const enablesIn = new Map<string, string[]>();
  const excludesEdges: CausalEdge[] = [];
  const invariantEdges: CausalEdge[] = [];
  const collect = (map: Map<string, string[]>, to: string, from: string): void => {
    const current = map.get(to) ?? [];
    current.push(from);
    map.set(to, current);
  };
  for (const edge of edges) {
    switch (edge.kind) {
      case "REQUIRES":
        collect(requiresIn, edge.to, edge.from);
        break;
      case "ENABLES":
        collect(enablesIn, edge.to, edge.from);
        break;
      case "EXCLUDES":
        excludesEdges.push(edge);
        break;
      case "INVARIANT":
        invariantEdges.push(edge);
        break;
      default:
        // MOTIVATES / PRECEDES: narrative/temporal only — no status effect.
        break;
    }
  }
  for (const list of [requiresIn, enablesIn]) {
    for (const key of list.keys()) {
      (list.get(key) ?? []).sort();
    }
  }

  // 5. Facts participating in the graph (edge endpoints) become constraint nodes.
  const factNodes = new Map<string, Fact>();
  for (const fact of canon.facts) {
    if (nodeSet.has(fact.id)) factNodes.set(fact.id, fact);
  }

  return { nodeIds, requiresIn, enablesIn, excludesEdges, invariantEdges, preMarks, facts: factNodes, forcedBy };
}

/** Status of a fact-as-constraint-node, derived from its validity window. */
function factNodeStatus(fact: Fact, statuses: Record<string, EventStatus>): EventStatus {
  const fromStatus = fact.validFrom === null ? "ESTABLISHED" : statuses[fact.validFrom] ?? "UNKNOWN";
  const toStatus = fact.validTo === null ? "UNKNOWN" : statuses[fact.validTo] ?? "UNKNOWN";
  const fromOk = ESTABLISHEDISH.has(fromStatus);
  const toViolated = ESTABLISHEDISH.has(toStatus);
  if (fromOk && !toViolated) return "ESTABLISHED";
  if (toViolated) return "EXCLUDED"; // expired: the fact is no longer true
  if (BLOCKED.has(fromStatus)) return "UNSUPPORTED"; // can never come true
  return "UNKNOWN"; // validFrom event has not occurred yet
}

/** REQUIRES / ENABLES base contribution for event and constraint nodes. */
function graphBase(
  node: string,
  model: DerivationModel,
  statuses: Record<string, EventStatus>,
  premark: EventStatus | undefined
): EventStatus {
  const incoming = model.requiresIn.get(node) ?? [];
  if (incoming.length === 0) return "ESTABLISHED"; // root: no hard prerequisites

  let allEstablished = true;
  let anyBlocked = false;
  let hasExcluded = false;
  for (const source of incoming) {
    const st = statuses[source] ?? "UNKNOWN";
    if (st === "EXCLUDED") {
      anyBlocked = true;
      hasExcluded = true;
    } else if (st === "UNSUPPORTED" || st === "CONTRADICTORY") {
      anyBlocked = true; // CONTRADICTORY source taints the target
    } else if (st !== "ESTABLISHED") {
      allEstablished = false;
    }
  }
  if (anyBlocked) {
    // Special case: a FORCED event whose REQUIRES source is EXCLUDED joins to
    // CONTRADICTORY — the intervention asserts an impossible event.
    return premark === "ESTABLISHED" && hasExcluded ? "EXCLUDED" : "UNSUPPORTED";
  }
  if (allEstablished) return "ESTABLISHED";

  // Hard path unresolved: soft access may still degrade/reach the target.
  const enables = model.enablesIn.get(node) ?? [];
  let enabledOpen = false;
  let enabledViolated = false;
  for (const source of enables) {
    const st = statuses[source] ?? "UNKNOWN";
    if (BLOCKED.has(st)) enabledViolated = true;
    else if (st === "ESTABLISHED") enabledOpen = true;
  }
  if (enabledViolated) return "UNSUPPORTED";
  if (enabledOpen) return "CONTINGENT";
  return "UNKNOWN";
}

/** One node's next status, as a monotone(ish) function of the current map. */
function computeNodeStatus(
  node: string,
  model: DerivationModel,
  statuses: Record<string, EventStatus>
): EventStatus {
  const factNode = model.facts.get(node);
  const premark = model.preMarks.get(node);

  let status: EventStatus;
  if (factNode !== undefined) {
    status = factNodeStatus(factNode, statuses);
  } else {
    status = graphBase(node, model, statuses, premark);
  }

  // Merge intervention pre-marks with the graph contribution.
  if (premark === "EXCLUDED") {
    // Negation is authoritative: the event never happens. Canon prerequisites
    // are about whether it CAN happen; they do not re-establish a negated event.
    status = "EXCLUDED";
  } else if (premark !== undefined) {
    status = joinStatuses(premark, status);
  }

  // EXCLUDES: symmetric mutual exclusion — both holding is a contradiction.
  for (const edge of model.excludesEdges) {
    if (edge.from !== node && edge.to !== node) continue;
    const other = edge.from === node ? edge.to : edge.from;
    const otherStatus = statuses[other] ?? "UNKNOWN";
    if (ESTABLISHEDISH.has(status) && ESTABLISHEDISH.has(otherStatus)) {
      status = "CONTRADICTORY";
    }
  }

  // INVARIANT: directed prohibition — source holding => target contradictory.
  for (const edge of model.invariantEdges) {
    if (edge.to !== node) continue;
    const sourceStatus = statuses[edge.from] ?? "UNKNOWN";
    if (ESTABLISHEDISH.has(sourceStatus) && ESTABLISHEDISH.has(status)) {
      status = "CONTRADICTORY";
    }
  }

  return status;
}

/**
 * Run the fixpoint: iterate passes over sorted node ids until no status
 * changes. The finite lattice guarantees termination; sorted iteration
 * guarantees determinism.
 */
export function propagateStatuses(model: DerivationModel): Record<string, EventStatus> {
  const statuses: Record<string, EventStatus> = {};
  for (const node of model.nodeIds) statuses[node] = "UNKNOWN";

  // Safety cap — the finite lattice converges in a handful of passes; this is
  // unreachable insurance, kept for absolute termination guarantees.
  const maxPasses = model.nodeIds.length * 8 + 16;
  let changed = true;
  let pass = 0;
  while (changed && pass < maxPasses) {
    changed = false;
    for (const node of model.nodeIds) {
      const next = computeNodeStatus(node, model, statuses);
      if (next !== (statuses[node] ?? "UNKNOWN")) {
        statuses[node] = next;
        changed = true;
      }
    }
    pass += 1;
  }
  return statuses;
}
