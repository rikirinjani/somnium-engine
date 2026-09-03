/**
 * Somnium Engine — WorldState contract + pure deterministic derivation.
 *
 * The derived world produced by derive(canon, interventions, rp?). This is a
 * pure memoizable value: same canon + same interventions + same rewind point
 * => identical WorldState (same identityHash). No randomness, no Date.now(), no
 * LLM, no network — everything is a deterministic function of the inputs.
 *
 * Pipeline (P-003):
 *   1. buildModel(canon, interventions)  — post-intervention causal graph
 *      (sever/add edges applied in order; negate/force targets collected;
 *      REQUIRES grouped into alternative sufficient support sets).
 *   2. propagateJudgments(model)         — staged evaluation producing a
 *      `Judgment` per node (truth × support × forced × negated) plus the
 *      conflicts that justify every contradiction. See propagation.ts for the
 *      phase structure and why it is monotone.
 *   3. `statuses` is the LOSSY PROJECTION of judgments via projectStatus, kept
 *      because every downstream consumer (diff, query, depth, work statuses)
 *      reads it. The engine itself reasons over `judgments`, never over this.
 *   4. Effective facts: canon facts whose validity window is satisfied by the
 *      final judgments (`occurs`), then fact interventions (setFact/relocate/
 *      retractFact) applied in order.
 * 5. Work statuses from member-event statuses + fact requirements/overrides.
 * 6. Contradiction records (never auto-repaired) + temporal violations.
 * 7. Two content hashes (P-004, docs §18.4):
 *      stateHash    — "are these the same WORLD?" effective state only;
 *      identityHash — "was this world reached the same WAY?" the memo key.
 *
 * INTERVENTION ORDER IS PART OF THE WORLD'S IDENTITY, but not uniformly.
 * Measured semantics (executable spec: src/derive/ordering.test.ts):
 *
 *   - `negateEvent` / `forceEvent` are SET-LIKE marks: idempotent, order-free.
 *   - `severEdge` / `addEdge` are SEQUENTIAL EDGE-SET WRITES: sever-then-add
 *     leaves the edge present, add-then-sever leaves it absent, so they do NOT
 *     commute on a canon where the edge is load-bearing.
 *   - `setFact` / `relocate` / `retractFact` are ASSIGNMENTS to a
 *     (subject, predicate) cell — last write wins — so they do NOT commute.
 *
 * `canonicalInterventions` folds the intervention list into `identityHash`
 * under exactly that split: set-like marks as a sorted deduplicated set, every
 * sequential kind in ACTUAL order. Hashing the raw ordered list would split
 * genuinely identical worlds; hashing only the derived projection collided a
 * no-op intervention chain with the baseline. P-001 hashed a fully sorted list,
 * silently assuming commutativity that does not hold.
 * The `interventions` field on the WorldState keeps the full ordered chain.
 */
import type { Canon, Fact, WorkBinding } from "../canon/types";
import type { FactVocabulary } from "../canon/fact-rules";
import { factAssertionError } from "../canon/fact-rules";
import { canonicalJson, hashState, sameCanonicalValue } from "../canon/hash";
import type { EventStatus, WorkStatus } from "./lattice";
import type { Intervention, RewindPoint } from "../timeline/types";
import type { ContradictionRecord } from "../diff/types";
import type { Judgment } from "./judgment";
import { occurs, projectStatus } from "./judgment";
import { buildModel, propagateJudgments, temporalViolations, cellKey } from "./propagation";
import type { TemporalViolation } from "./propagation";
import { detectContradictions } from "./contradictions";
import { evaluateConstraints } from "./constraints";
import type { ConstraintViolationRecord } from "./constraints";
import { semanticState, canonicalizeEdge } from "./semantic";
import type { CanonicalEdge } from "./semantic";

export interface WorldState {
  canonId: string;
  interventions: Intervention[]; // full ordered chain from baseline
  rpId: string | null;
  /**
   * The engine's actual verdicts: node id -> Judgment (sorted keys).
   * P-003 replaced the single-axis status with these orthogonal dimensions.
   */
  judgments: Record<string, Judgment>;
  /** event id / fact-constraint node -> projected status (lossy, for reporting) */
  statuses: Record<string, EventStatus>;
  /** effective facts in this world (validity windows applied) */
  facts: FactView[];
  /** canonical Work -> classification in this world */
  workStatuses: Record<string, WorkStatus>;
  contradictions: ContradictionRecord[];
  /** PRECEDES cycles among occurring events — unsatisfiable timelines */
  temporalViolations: TemporalViolation[];
  /**
   * P-006 — cardinality constraint violations (AT_MOST_ONE / AT_LEAST_ONE over
   * an EventType), evaluated over the effective occurrence set of THIS world.
   *
   * Distinct from contradictions (the world asserting P and ¬P) and from causal
   * impossibility (UNSUPPORTED). A violated constraint does NOT mutate the world
   * to become valid; the extra occurrence keeps its causal status. Part of the
   * effective world, therefore folded into `stateHash`.
   */
  constraintViolations: ConstraintViolationRecord[];
  /**
   * P-007 — the effective causal LAW of this world: the canon's edge set after
   * severEdge/addEdge interventions, canonicalized (id, kind, from, to) and
   * sorted by id. The world's meaning includes WHY things happen, not just
   * WHETHER: severing a load-bearing REQUIRES edge can leave every verdict
   * unchanged (the event becomes a root) while the world's causal structure is
   * genuinely different. Part of the effective world, folded into `stateHash`
   * and diffed as `edgeChanges`.
   */
  edges: CanonicalEdge[];
  /**
   * "Are these the same WORLD?" — effective state only, provenance-independent
   * BY CONSTRUCTION (P-007): folded from canon + the canonical semantic
   * projection (src/derive/semantic.ts) — statuses, fact content, the effective
   * edge set, work classifications, contradiction content, temporal violations,
   * constraint violations. Lineage (judgments' forced/negated marks, facts'
   * source/overridden flags, contradictions' source, `rpId`, `interventions`)
   * is DELIBERATELY excluded: a world is the same world regardless of how it
   * was reached, and "reached differently" is `identityHash`'s question.
   */
  stateHash: string;
  /**
   * "Was this world reached the same WAY?" — full derivation identity; the memo
   * key. Folded from stateHash + rpId + the canonical intervention form
   * (canonicalInterventions), so keying a memo on it can never hand back a
   * state carrying someone else's provenance.
   */
  identityHash: string;
}

/** A fact as visible in a derived world (may differ from canon by overrides). */
export interface FactView {
  id: string;
  subject: string;
  predicate: string;
  object: string | number | boolean | null;
  source: "canon" | "derived";
  overridden?: boolean; // true if changed by an intervention
  /** narrative-time validity window (attached for recency queries) */
  validFrom?: string | null;
  validTo?: string | null;
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/**
 * A canon fact is effective when its validity window is satisfied.
 *
 * P-003: this now tests `occurs(judgment)` rather than membership of an
 * ESTABLISHED|CONTRADICTORY status set. Same observable behaviour, sound basis —
 * "did the boundary event happen in this world?" is a truth question, and
 * `occurs` answers exactly that (TRUE or BOTH).
 */
function isEffective(fact: Fact, judgments: Map<string, Judgment>): boolean {
  const happened = (node: string): boolean => {
    const j = judgments.get(node);
    return j !== undefined && occurs(j);
  };
  const fromOk = fact.validFrom === null || happened(fact.validFrom);
  const toViolated = fact.validTo !== null && happened(fact.validTo);
  return fromOk && !toViolated;
}

/** Effective canon facts (validity windows applied), sorted by id. */
function computeEffectiveFacts(canon: Canon, judgments: Map<string, Judgment>): FactView[] {
  const out: FactView[] = [];
  for (const fact of canon.facts) {
    if (isEffective(fact, judgments)) {
      out.push({
        id: fact.id,
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        source: fact.source,
        validFrom: fact.validFrom,
        validTo: fact.validTo,
      });
    }
  }
  out.sort(byId);
  return out;
}

/**
 * setFact / relocate: replace every effective fact for (subject, predicate)
 * with a single derived fact. It keeps the replaced fact's id when one exists
 * (so the diff lane sees an override, not an add+remove), else a synthetic id.
 */
function overrideFact(
  facts: FactView[],
  subject: string,
  predicate: string,
  object: unknown
): FactView[] {
  const matching = facts
    .filter((f) => f.subject === subject && f.predicate === predicate)
    .sort((a, b) => (a.validFrom ?? "").localeCompare(b.validFrom ?? ""));
  const replaced = matching[matching.length - 1];
  const derived: FactView = {
    // P-007 gate 3: the synthetic id must be INJECTIVE over (subject,
    // predicate), because the effective fact list is id-keyed downstream —
    // `worldDiff` builds a Map from it and `computeWorkStatuses` matches canon
    // facts by id. Joining with `.` was not: `(char/ash, "the.elder.mood")` and
    // `(char/ash.the.elder, "mood")` minted ONE id for two distinct cells, so
    // the hash saw two facts while the diff saw one and a real value change
    // became invisible. `cellKey` is the SAME key `buildModel` uses for the same
    // reason — one implementation, in propagation.ts.
    id: replaced?.id ?? `derived:${cellKey(subject, predicate)}`,
    subject,
    predicate,
    object: (object ?? null) as string | number | boolean | null,
    source: "derived",
    overridden: true,
    validFrom: replaced?.validFrom ?? null,
    validTo: replaced?.validTo ?? null,
  };
  const out = facts.filter((f) => !(f.subject === subject && f.predicate === predicate));
  out.push(derived);
  out.sort(byId);
  return out;
}

/**
 * Fact interventions applied in order over the effective fact list.
 *
 * Uses `factAssertionError` — the SAME function `validateCanon` and `buildModel`
 * apply — because this function and `buildModel`'s `overriddenCells` are TWO
 * VIEWS OF THE SAME FACT and must agree. §18.6 was exactly this defect (fact
 * nodes ignoring fact interventions), and gating only one side here recreated it
 * twice in one sitting: first the subject rule, then the object rule. One
 * function at every call site makes the views incapable of disagreeing, and
 * makes the claim differential: an intervention may assert no more than canon may.
 */
function applyFactInterventions(
  facts: FactView[],
  interventions: Intervention[],
  vocabulary: FactVocabulary
): FactView[] {
  let current = facts;
  for (const iv of interventions) {
    if (iv.kind === "setFact" || iv.kind === "relocate") {
      const predicate = iv.kind === "setFact" ? iv.params?.predicate : "located_in";
      const object = iv.kind === "setFact" ? iv.params?.object : iv.params?.to;
      if (typeof predicate !== "string") continue;
      const value = (object ?? null) as string | number | boolean | null;
      if (factAssertionError(iv.target, predicate, value, vocabulary) !== null) continue;
      current = overrideFact(current, iv.target, predicate, value);
    } else if (iv.kind === "retractFact") {
      current = current.filter((f) => f.id !== iv.target);
    }
  }
  return current;
}

/**
 * Does a Work depend on an (effective) fact? P-004: the UNION of three rules.
 *   1. the fact is listed in `work.facts` — an explicit STATE requirement
 *      ("the investiture is this story only if the Seal is in the right hands");
 *   2. the fact's validity window is anchored to a member event — `validFrom` or
 *      `validTo` is one of the Work's events, i.e. the Work's events bring the
 *      fact about or end it;
 *   3. the fact's subject is a member event — a fact ABOUT the event itself.
 *      Pre-P-004 `computeWorkStatuses` used exactly this rule and only this
 *      rule; it is a legitimate subset of the dependency relation, not the
 *      whole definition (it made ALTERED unreachable under a canon where the
 *      overridable facts are about characters and the Works are about events).
 */
function workDependsOnFact(canon: Canon, work: WorkBinding, fact: FactView): boolean {
  if (work.facts !== undefined && work.facts.includes(fact.id)) return true;
  if (work.events.includes(fact.subject)) return true;
  const members = new Set(work.events);
  return canon.facts.some(
    (cf) =>
      cf.id === fact.id &&
      ((cf.validFrom !== null && members.has(cf.validFrom)) ||
        (cf.validTo !== null && members.has(cf.validTo)))
  );
}

/** Canonical Work -> classification from member-event statuses + fact state. */
function computeWorkStatuses(
  canon: Canon,
  statuses: Record<string, EventStatus>,
  facts: FactView[]
): Record<string, WorkStatus> {
  const result: Record<string, WorkStatus> = {};
  // P-007 (D4): ALTERED is VALUE-BASED, not touch-based. A fact is
  // altered-from-canon iff its effective object differs from the canon fact
  // of the same id, or canon never declared that fact id. The old rule keyed
  // on the `overridden` lineage flag, so an idempotent write (the value
  // restored to canon's) still flipped a Work to ALTERED — record churn
  // becoming semantic change, exactly what P-007 forbids.
  //
  // The comparison is `sameCanonicalValue`, never `!==` (P-007 gate 2). This
  // feeds `workStatuses`, which IS a semanticState dimension, so a comparison
  // that disagrees with the canonical encoding puts a wrong value INTO world
  // identity — worse than the diff-level version of the same bug, because INV
  // cannot catch it (both sides read the same wrong value). With `!==`, a canon
  // fact whose object is NaN read as altered-from-canon against ITSELF, so an
  // untouched world reported ALTERED and a genuine later change reported no
  // work-status delta at all.
  const canonObjectById = new Map(canon.facts.map((f) => [f.id, f.object]));
  const altered = facts.filter((f) => {
    const canonObject = canonObjectById.get(f.id);
    return !canonObjectById.has(f.id) || !sameCanonicalValue(canonObject, f.object);
  });
  const effectiveById = new Map(facts.map((f) => [f.id, f]));
  for (const work of canon.workBindings) {
    const members = work.events.map((e) => statuses[e] ?? "UNKNOWN");
    const any = (s: EventStatus): boolean => members.includes(s);
    const allEstablished = members.every((m) => m === "ESTABLISHED");

    // Classification cascade (P-004, ordered; absent `facts` on the Work makes
    // step 2 a no-op, so behaviour is identical to pre-P-004):
    //   1. event-status rules first: any EXCLUDED / UNSUPPORTED / CONTRADICTORY
    //      member => IMPOSSIBLE (pre-existing).
    //   2. missing required facts: a fact listed in `work.facts` that is NOT
    //      effective in this world => IMPOSSIBLE — the story cannot hold as
    //      written.
    //   3. all members ESTABLISHED AND any fact the Work depends on is
    //      altered-from-canon (value differs, or canon never declared it)
    //      => ALTERED (see workDependsOnFact for the dependency union).
    //   4. all members ESTABLISHED => PRESERVED.
    //   5. any CONTINGENT member (and not all established) => UNREACHABLE.
    //   6. otherwise => UNKNOWN.
    const missingRequired = (work.facts ?? []).some((id) => !effectiveById.has(id));
    const affectedByAlteration = allEstablished && altered.some((f) => workDependsOnFact(canon, work, f));

    if (any("EXCLUDED") || any("UNSUPPORTED") || any("CONTRADICTORY")) {
      result[work.workId] = "IMPOSSIBLE";
    } else if (missingRequired) {
      result[work.workId] = "IMPOSSIBLE";
    } else if (affectedByAlteration) {
      result[work.workId] = "ALTERED";
    } else if (allEstablished) {
      result[work.workId] = "PRESERVED";
    } else if (any("CONTINGENT")) {
      result[work.workId] = "UNREACHABLE";
    } else {
      result[work.workId] = "UNKNOWN";
    }
  }
  return result;
}

/** Map -> sorted-key record, so hashing and equality are order-independent. */
function toSortedRecord<T>(map: Map<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of [...map.keys()].sort()) {
    out[key] = map.get(key) as T;
  }
  return out;
}

/**
 * Interventions that are genuinely SET-LIKE: they mark a node, idempotently.
 * `negateEvent` adds to a set of negated targets; `forceEvent` writes a target
 * into a map. Applying either twice equals applying it once, and order between
 * them never matters.
 *
 * `severEdge` / `addEdge` are deliberately NOT here. They MUTATE the edge set in
 * sequence (see `resolveEdges` in propagation.ts), so sever-then-add leaves the
 * edge present while add-then-sever leaves it absent. On a canon where the edge
 * is load-bearing those are different worlds — measured: with `ev/q REQUIRES
 * ev/p` and `p` negated, [sever, add] gives `ev/q` UNSUPPORTED and [add, sever]
 * gives ESTABLISHED. Treating them as a set collided those two worlds on one
 * hash (caught by the P-003 L2 gate, ncr-002).
 */
const SET_LIKE_KINDS: ReadonlySet<string> = new Set(["negateEvent", "forceEvent"]);

function interventionKey(iv: Intervention): string {
  return canonicalJson({ kind: iv.kind, target: iv.target, params: iv.params ?? {} });
}

/**
 * Canonical form of an intervention list, mirroring the MEASURED commutation
 * semantics (executable spec: src/derive/ordering.test.ts):
 *
 *   - `setLike` — negateEvent / forceEvent. Sorted and deduplicated, so two
 *     orders of the same marks are one identity.
 *   - `ordered` — severEdge / addEdge / setFact / relocate / retractFact. All
 *     sequential writes: to the edge set, or to a (subject, predicate) cell.
 *     Kept in ACTUAL order, because reordering them changes the world.
 *
 * This is what makes `identityHash` a sound identity. Hashing the raw ordered
 * list would split worlds that are genuinely identical (two orders of the same
 * negations); hashing only the derived content collided a no-op intervention
 * chain with the baseline, letting a hash-keyed memo return a state carrying
 * the wrong `interventions` provenance.
 */
function canonicalInterventions(interventions: Intervention[]): {
  setLike: string[];
  ordered: string[];
} {
  const setLike = new Set<string>();
  const ordered: string[] = [];
  for (const iv of interventions) {
    const key = interventionKey(iv);
    if (SET_LIKE_KINDS.has(iv.kind)) setLike.add(key);
    else ordered.push(key);
  }
  return { setLike: [...setLike].sort(), ordered };
}

/**
 * Pure deterministic derivation: canon + ordered interventions + optional
 * rewind point => WorldState. The single entry point of the simulation core.
 *
 * The intervention list is consumed IN ORDER. Only `negateEvent` / `forceEvent`
 * are set-like marks (idempotent, order-free); `severEdge` / `addEdge` are
 * sequential edge-set writes and `setFact` / `relocate` / `retractFact` are
 * sequential cell assignments, so both of those classes are order-sensitive.
 * `identityHash` encodes exactly that split via `canonicalInterventions`.
 */
export function derive(
  canon: Canon,
  interventions: Intervention[],
  rp?: RewindPoint
): WorldState {
  const model = buildModel(canon, interventions);
  const { judgments, conflicts } = propagateJudgments(model);

  const statusMap = new Map<string, EventStatus>();
  for (const [node, judgment] of judgments) {
    statusMap.set(node, projectStatus(judgment));
  }

  const facts = applyFactInterventions(
    computeEffectiveFacts(canon, judgments),
    interventions,
    model.factVocabulary
  );
  const statuses = toSortedRecord(statusMap);
  const workStatuses = computeWorkStatuses(canon, statuses, facts);
  const contradictions = detectContradictions(conflicts);
  const violations = temporalViolations(model, judgments);
  const rpId = rp?.id ?? null;

  // Construct the world once; P-006 constraint evaluation reads occurrenceCount
  // which reads effective facts, so it needs the world to exist first.
  const world: WorldState = {
    canonId: canon.canonId,
    interventions: [...interventions], // full ordered chain from baseline
    rpId,
    judgments: toSortedRecord(judgments),
    statuses,
    facts,
    workStatuses,
    contradictions,
    temporalViolations: violations,
    constraintViolations: [],
    // P-007: the effective causal LAW — the resolved edge set this world was
    // derived under (severEdge/addEdge applied in order), canonicalized.
    // `canonicalizeEdge` owns the normalization (group defaulted on REQUIRES,
    // null elsewhere) so the hash folds exactly what the derivation reads.
    edges: model.edges.map(canonicalizeEdge),
    stateHash: "",
    identityHash: "",
  };
  world.constraintViolations = evaluateConstraints(canon, world);

  // Two hashes, two questions (P-004, docs/ARCHITECTURE-RECONNAISSANCE.md §18.4;
  // P-007 made the first provenance-independent BY CONSTRUCTION):
  //
  //   stateHash — "are these the same WORLD?" The effective state only, folded
  //   from canon + the canonical semantic projection (src/derive/semantic.ts):
  //   statuses, fact CONTENT (no source/overridden lineage flags), the effective
  //   edge set, work statuses, contradiction CONTENT (no source), temporal
  //   violations, constraint violations. Judgments are NOT folded — statuses is
  //   their world-semantic projection; the forced/negated marks are lineage.
  //   DELIBERATELY excludes `rpId` and `interventions`: a world is the same
  //   world regardless of how it was reached, and "did two different
  //   intervention chains reach the same world?" must be answerable (that is
  //   the deferred minimum-intervention search's immediate neighbourhood, and
  //   cross-canon genericity is exactly where convergent branches show up).
  //
  //   identityHash — "was this world reached the same WAY?" The full derivation
  //   identity: stateHash + rpId + the canonical intervention form. This is the
  //   memo key: keying a memo on stateHash alone could hand back a state
  //   carrying someone else's `interventions` provenance.
  //
  // `canonicalInterventions` folds the intervention list in under its MEASURED
  // commutation semantics: set-like marks (negateEvent / forceEvent) as a sorted
  // deduplicated set, every sequential kind (severEdge / addEdge / setFact /
  // relocate / retractFact) in ACTUAL order.
  //
  // P-007 INVARIANT: worldDiff(A, B) is empty ⟺ stateHash(A) === stateHash(B)
  // (same canon) — both sides consume the SAME semanticState projection, so the
  // invariant holds by construction (32-bit hash collisions excepted).
  world.stateHash = hashState({
    canonId: canon.canonId,
    canonHash: canon.hash,
    semantic: semanticState(world),
  });
  world.identityHash = hashState({
    stateHash: world.stateHash,
    rpId,
    interventions: canonicalInterventions(interventions),
  });

  return world;
}
