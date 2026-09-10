/**
 * S007 — deterministic workload generators.
 *
 * Every generator is a pure function of (canon, config, seed). No Date, no
 * Math.random, no I/O. The same seed yields the same intervention stream, so
 * two runs of the same config produce identical hashes (verified in Exp C).
 *
 * Targets are extracted from the canon itself, so generated interventions are
 * always well-formed against the canon under test.
 */
import type { Canon, CausalEdge } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";
import { seededRng, pick } from "./harness";

export interface TargetPool {
  entities: string[]; // entity ids (subjects for setFact / relocate)
  events: string[]; // event ids (negate/force)
  facts: string[]; // fact ids (retract)
  edges: CausalEdge[]; // edges (sever / re-add)
  predicates: string[]; // predicates observed in canon facts
  locations: string[]; // location entity ids (relocate targets)
  objects: (string | number | boolean | null)[]; // plausible object values
}

/** Extract a deterministic, sorted target pool from a canon. */
export function buildTargetPool(canon: Canon): TargetPool {
  const entities = canon.entities
    .filter((e) => e.kind !== "Event" && e.kind !== "EventType")
    .map((e) => e.id)
    .sort();
  const events = canon.entities
    .filter((e) => e.kind === "Event")
    .map((e) => e.id)
    .sort();
  const locations = canon.entities
    .filter((e) => e.kind === "Location")
    .map((e) => e.id)
    .sort();
  const facts = canon.facts.map((f) => f.id).sort();
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const predicates = [...new Set(canon.facts.map((f) => f.predicate))].sort();
  const objects = [...new Set(canon.facts.map((f) => f.object))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  return { entities, events, facts, edges, predicates, locations, objects };
}

export type InterventionKindName = "setFact" | "negateEvent" | "forceEvent" | "retractFact" | "severEdge" | "addEdge";

export interface WorkloadWeights {
  setFact: number;
  negateEvent: number;
  forceEvent: number;
  retractFact: number;
  severEdge: number;
  addEdge: number;
}

export const DEFAULT_WEIGHTS: WorkloadWeights = {
  setFact: 5,
  negateEvent: 2,
  forceEvent: 2,
  retractFact: 1,
  severEdge: 1,
  addEdge: 1,
};

function weightedKind(rng: () => number, weights: WorkloadWeights): InterventionKindName {
  const entries = Object.entries(weights) as [InterventionKindName, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [kind, w] of entries) {
    r -= w;
    if (r <= 0) return kind;
  }
  return entries[0]![0];
}

/** One intervention, deterministic from (rng, pool, weights). */
export function makeIntervention(
  rng: () => number,
  pool: TargetPool,
  weights: WorkloadWeights
): Intervention {
  // Retry a bounded number of times if the chosen kind has no valid target.
  for (let attempt = 0; attempt < 8; attempt++) {
    const kind = weightedKind(rng, weights);
    switch (kind) {
      case "setFact": {
        if (pool.entities.length === 0 || pool.predicates.length === 0) break;
        const subject = pick(rng, pool.entities);
        const predicate = pick(rng, pool.predicates);
        const object = pool.objects.length > 0 ? pick(rng, pool.objects) : "true";
        return setFact(subject, predicate, object, `s007-${subject}-${predicate}`);
      }
      case "negateEvent": {
        if (pool.events.length === 0) break;
        return negateEvent(pick(rng, pool.events), "s007");
      }
      case "forceEvent": {
        if (pool.events.length === 0) break;
        return forceEvent(pick(rng, pool.events), "s007");
      }
      case "retractFact": {
        if (pool.facts.length === 0) break;
        return retractFact(pick(rng, pool.facts), "s007");
      }
      case "severEdge": {
        if (pool.edges.length === 0) break;
        return severEdge(pick(rng, pool.edges).id, "s007");
      }
      case "addEdge": {
        if (pool.edges.length === 0) break;
        // Re-add an existing edge — a valid, idempotent-ish edge-set write.
        return addEdge({ ...pick(rng, pool.edges) }, "s007");
      }
    }
  }
  // Fallback: a no-op-safe setFact on the first entity if anything is available.
  if (pool.entities.length > 0) return setFact(pool.entities[0]!, "s007_noop", true, "s007");
  return negateEvent("s007_noop", "s007");
}

/* ------------------------------------------------------------------ */
/* Experiment A — linear chain                                         */
/* ------------------------------------------------------------------ */

export interface LinearWorkload {
  interventions: Intervention[];
}

/**
 * A single deterministic chain of length H. Callers build prefixes on demand:
 * materializing all H+1 prefixes is O(H^2) memory and was observed to OOM the
 * harness at H=100,000 — it measures the harness, not the engine.
 */
export function linearWorkload(canon: Canon, h: number, seed: number, weights = DEFAULT_WEIGHTS): LinearWorkload {
  const pool = buildTargetPool(canon);
  const rng = seededRng(seed);
  const interventions: Intervention[] = [];
  for (let i = 0; i < h; i++) interventions.push(makeIntervention(rng, pool, weights));
  return { interventions };
}

/**
 * Derive every prefix W_0 .. W_H without materializing them all. `chain` grows by
 * one intervention per step, so peak extra memory is O(H), and each `derive`
 * receives the current prefix exactly as production would.
 */
export function walkChain<T>(interventions: Intervention[], step: (prefix: Intervention[], k: number) => T): T[] {
  const out: T[] = [];
  const chain: Intervention[] = [];
  for (let k = 0; k <= interventions.length; k++) {
    out.push(step(chain, k));
    if (k < interventions.length) chain.push(interventions[k]!);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Experiment B — branching tree                                       */
/* ------------------------------------------------------------------ */

export interface BranchNode {
  id: string;
  parentId: string | null;
  depth: number;
  interventions: Intervention[]; // full chain from root
}

export interface BranchingWorkload {
  nodes: BranchNode[];
  depth: number;
  branchFactor: number;
  totalTrajectories: number;
}

/**
 * Build a tree of depth D where every non-leaf node spawns `branchFactor`
 * children, each child extending its parent's chain with ONE new intervention.
 *
 * Deterministic: node order is breadth-first, the RNG stream is consumed in
 * that order, so the same (canon, D, B, seed) reproduces the same tree.
 */
export function branchingWorkload(
  canon: Canon,
  depth: number,
  branchFactor: number,
  seed: number,
  weights = DEFAULT_WEIGHTS
): BranchingWorkload {
  const pool = buildTargetPool(canon);
  const rng = seededRng(seed);
  const nodes: BranchNode[] = [];
  const root: BranchNode = { id: "n0", parentId: null, depth: 0, interventions: [] };
  nodes.push(root);

  let frontier: BranchNode[] = [root];
  let counter = 1;
  for (let d = 1; d <= depth; d++) {
    const next: BranchNode[] = [];
    for (const parent of frontier) {
      for (let b = 0; b < branchFactor; b++) {
        const iv = makeIntervention(rng, pool, weights);
        const child: BranchNode = {
          id: `n${counter++}`,
          parentId: parent.id,
          depth: d,
          interventions: [...parent.interventions, iv],
        };
        nodes.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }

  const totalTrajectories = frontier.length;
  return { nodes, depth, branchFactor, totalTrajectories };
}

/* ------------------------------------------------------------------ */
/* Experiment C — convergent histories                                 */
/* ------------------------------------------------------------------ */

export interface ConvergentGroup {
  /** Group label — every history in the group must reach the same stateHash. */
  label: string;
  /** Each history is a full intervention chain from the same baseline. */
  histories: Intervention[][];
}

/**
 * Construct groups of DIFFERENT histories that provably reach the SAME
 * effective semantic state. Uses only P-007 documented semantics:
 *
 *  - idempotent setFact: writing the same (subject,predicate,object) 1x vs 3x
 *  - idempotent negate/force: applying the same event mark 1x vs 3x
 *  - order-free across cells: writes to distinct cells commute
 *
 * These are semantic equivalences, not coincidences: the P-007 convergence
 * suite already establishes them. S007 measures them at scale.
 */
export function convergentGroups(canon: Canon, seed: number): ConvergentGroup[] {
  const pool = buildTargetPool(canon);
  const rng = seededRng(seed);
  const groups: ConvergentGroup[] = [];

  // G1: setFact idempotence — 1 write vs repeated identical writes.
  if (pool.entities.length > 0 && pool.predicates.length > 0) {
    const s = pick(rng, pool.entities);
    const p = pick(rng, pool.predicates);
    const o = pool.objects.length > 0 ? pick(rng, pool.objects) : "true";
    const w = (): Intervention => setFact(s, p, o, "conv");
    groups.push({
      label: `setFact-idempotent:${s}:${p}`,
      histories: [[w()], [w(), w()], [w(), w(), w()]],
    });
  }

  // G2: negateEvent idempotence.
  if (pool.events.length > 0) {
    const e = pick(rng, pool.events);
    const n = (): Intervention => negateEvent(e, "conv");
    groups.push({ label: `negate-idempotent:${e}`, histories: [[n()], [n(), n()]] });
  }

  // G3: distinct-cell writes commute (two orders of two independent writes).
  if (pool.entities.length >= 2 && pool.predicates.length >= 2) {
    const s1 = pool.entities[0]!;
    const s2 = pool.entities[1]!;
    const p1 = pool.predicates[0]!;
    const p2 = pool.predicates[1]!;
    const a = setFact(s1, p1, true, "conv");
    const b = setFact(s2, p2, true, "conv");
    groups.push({ label: `commute:${s1}.${p1}|${s2}.${p2}`, histories: [[a, b], [b, a]] });
  }

  // G4: rewriting the CURRENTLY-EFFECTIVE fact for a cell with its exact value
  // is a true no-op. NOTE: the effective fact is NOT necessarily the
  // canon-declared one — interventions key on (subject, predicate) cells and
  // validity windows decide which fact holds a cell — so derive the base world
  // first and read the effective fact. (Writing a canon fact's declared value
  // when a different fact holds that cell is a real change, not a no-op; that
  // distinction is itself a finding, recorded in the report.)
  {
    const base = derive(canon, []);
    const eff = base.facts.find((f) => f.source === "canon") ?? base.facts[0];
    if (eff) {
      const n = 8;
      const long: Intervention[] = [];
      for (let i = 0; i < n; i++) long.push(setFact(eff.subject, eff.predicate, eff.object, "conv"));
      groups.push({ label: `redundant-${n}-rewrites:${eff.id}`, histories: [[], long] });
    }
  }

  // G5: N different histories that share a core write but differ in how many
  // redundant repeats follow it must ALL converge to one semantic state. This is
  // the P-007 property at scale: history length grows, effective state does not.
  if (canon.facts.length > 0) {
    const f = canon.facts[0]!;
    const core = (): Intervention => setFact(f.subject, f.predicate, f.object, "core");
    const histories: Intervention[][] = [];
    for (let reps = 1; reps <= 10; reps++) {
      const h: Intervention[] = [core()];
      for (let i = 0; i < reps; i++) h.push(setFact(f.subject, f.predicate, f.object, "redundant"));
      histories.push(h);
    }
    groups.push({ label: `convergent-repetition:${f.id}`, histories });
  }

  return groups;
}
