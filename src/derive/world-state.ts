/**
 * Somnium Engine — WorldState contract + pure deterministic derivation.
 *
 * The derived world produced by derive(canon, interventions, rp?). This is a
 * pure memoizable value: same canon + same interventions + same rewind point
 * => identical WorldState (same hash). No randomness, no Date.now(), no LLM,
 * no network — everything is a deterministic function of the inputs.
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
 *   5. Work statuses from member-event statuses + fact overrides.
 *   6. Contradiction records (never auto-repaired) + temporal violations.
 *   7. Content hash over the deterministic projection of everything above.
 */
import type { Canon, Fact } from "../canon/types";
import { hashState, canonicalJson } from "../canon/hash";
import type { EventStatus, WorkStatus } from "./lattice";
import type { Intervention, RewindPoint } from "../timeline/types";
import type { ContradictionRecord } from "../diff/types";
import type { Judgment } from "./judgment";
import { occurs, projectStatus } from "./judgment";
import { buildModel, propagateJudgments, temporalViolations } from "./propagation";
import type { TemporalViolation } from "./propagation";
import { detectContradictions } from "./contradictions";

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
  /** content hash of the world (memoization key / replay fingerprint) */
  hash: string;
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
    id: replaced?.id ?? `derived:${subject}.${predicate}`,
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

/** Fact interventions applied in order over the effective fact list. */
function applyFactInterventions(facts: FactView[], interventions: Intervention[]): FactView[] {
  let current = facts;
  for (const iv of interventions) {
    if (iv.kind === "setFact" || iv.kind === "relocate") {
      const predicate = iv.kind === "setFact" ? iv.params?.predicate : "located_in";
      const object = iv.kind === "setFact" ? iv.params?.object : iv.params?.to;
      if (typeof predicate === "string") {
        current = overrideFact(current, iv.target, predicate, object);
      }
    } else if (iv.kind === "retractFact") {
      current = current.filter((f) => f.id !== iv.target);
    }
  }
  return current;
}

/** Canonical Work -> classification from member-event statuses + overrides. */
function computeWorkStatuses(
  canon: Canon,
  statuses: Record<string, EventStatus>,
  facts: FactView[]
): Record<string, WorkStatus> {
  const result: Record<string, WorkStatus> = {};
  const overridden = facts.filter((f) => f.overridden === true);
  for (const work of canon.workBindings) {
    const members = work.events.map((e) => statuses[e] ?? "UNKNOWN");
    const any = (s: EventStatus): boolean => members.includes(s);
    const allEstablished = members.every((m) => m === "ESTABLISHED");
    const affectedByOverride = overridden.some((f) => work.events.includes(f.subject));

    if (any("EXCLUDED") || any("UNSUPPORTED") || any("CONTRADICTORY")) {
      result[work.workId] = "IMPOSSIBLE";
    } else if (allEstablished && affectedByOverride) {
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

/** Deterministic sort of interventions for hashing: by id + params. */
function sortKey(iv: Intervention): string {
  return canonicalJson({ id: iv.id, kind: iv.kind, target: iv.target, params: iv.params ?? {} });
}

function sortedInterventions(interventions: Intervention[]): Intervention[] {
  return [...interventions].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
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
 * Pure deterministic derivation: canon + ordered interventions + optional
 * rewind point => WorldState. The single entry point of the simulation core.
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

  const facts = applyFactInterventions(computeEffectiveFacts(canon, judgments), interventions);
  const statuses = toSortedRecord(statusMap);
  const workStatuses = computeWorkStatuses(canon, statuses, facts);
  const contradictions = detectContradictions(conflicts);
  const violations = temporalViolations(model, judgments);
  const rpId = rp?.id ?? null;

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
    hash: "",
  };

  // Content hash over the deterministic projection (canonicalJson sorts keys).
  world.hash = hashState({
    canonId: canon.canonId,
    canonHash: canon.hash,
    interventions: sortedInterventions(interventions),
    rpId,
    judgments: world.judgments,
    statuses,
    facts,
    workStatuses,
    contradictions,
    temporalViolations: violations,
  });

  return world;
}
