/**
 * Somnium Engine — the canonical semantic projection of a world (P-007).
 *
 * ONE projection, TWO consumers: `stateHash` hashes it, `worldDiff` compares
 * it. That is what makes the P-007 invariant hold by construction:
 *
 *   > For two worlds from the SAME canon:
 *   > worldDiff(A, B) is empty  ⟺  stateHash(A) === stateHash(B)
 *
 * (Hash-collision direction excepted: FNV-1a is 32-bit, so distinct semantic
 * states may share a hash with probability ~2^-32 per pair. In that direction
 * the diff is the MORE reliable witness — its fact, status, work and edge
 * dimensions compare canonical content directly. The three RECORD dimensions
 * (contradictions, constraint violations, temporal violations) compare the
 * canonical content STRING, not a digest of it, precisely so a collision there
 * cannot make the diff miss a real difference — an earlier draft keyed those
 * sets on a 32-bit hash and the P-007 gate found a live collision in under 350k
 * candidates.)
 *
 * WHAT IS SEMANTIC vs WHAT IS LINEAGE (the P-007 findings, measured in
 * experiments/p007/probes.ts):
 *
 *   SEMANTIC (folded here): statuses (the world-semantic projection of
 *   judgments), effective fact CONTENT (id, subject, predicate, object,
 *   validity windows), the effective edge set (the causal LAW of this world),
 *   work classifications, contradiction CONTENT, temporal violations,
 *   constraint violations.
 *
 *   LINEAGE (deliberately dropped): `judgments.forced`/`negated` marks (how the
 *   verdict was produced), `facts.source`/`overridden` (how the fact value was
 *   written), `contradictions.source` (which intervention caused the record).
 *   These belong to `identityHash` via `canonicalInterventions` — "was this
 *   world reached the same WAY?" — and must never leak into "is this the same
 *   WORLD?".
 *
 *   Also dropped: `judgments` themselves. The judgment model is the engine's
 *   EPISTEMIC evaluation (truth × support × forced × negated); `statuses` is
 *   its world-semantic projection. The one distinction statuses lose —
 *   UNFOUNDED vs NONE support, both projecting to UNKNOWN/UNSUPPORTED — is
 *   engine epistemics by the §5 analysis of docs/P007-WORLDDIFF.md, and stays
 *   available on `WorldState.judgments` for consumers that want it.
 */
import type { EventStatus, WorkStatus } from "./lattice";
import type { TemporalViolation } from "./propagation";
import type { ConstraintViolationRecord } from "./constraints";
import type { WorldState } from "./world-state";
import { canonicalJson } from "../canon/hash";

/** A fact's world-semantic content: identity + claim + narrative-time window. */
export interface CanonicalFact {
  id: string;
  subject: string;
  predicate: string;
  object: string | number | boolean | null;
  validFrom: string | null;
  validTo: string | null;
}

/** A contradiction's world-semantic content. `source` is lineage — dropped. */
export interface CanonicalContradiction {
  id: string;
  a: string;
  b: string;
  detail: string;
  detectedAt: string;
}

/**
 * An edge's world-semantic content: the causal law, without its note.
 *
 * `group` IS semantic and must be here (P-007 gate 1, blocker 1). It selects
 * whether same-target REQUIRES edges are conjuncts of one sufficient set or
 * ALTERNATIVE sufficient sets (propagation.ts's `supportGroups`) — that is, it
 * decides the very property that makes an edge load-bearing. Omitting it let
 * two worlds share a `stateHash` and an empty diff while their EFFECTIVE
 * SUPPORT STRUCTURE differed. Measured on both seed canons; docs/P007-WORLDDIFF.md §4.
 *
 * The justification is that `group` is effective-world structure, NOT that
 * same-hash worlds can never diverge under a later intervention. Gate 2 refuted
 * that stronger form: `derive(c, [])` and `derive(c, [forceEvent(root)])` are
 * the same world by design (`forced` is lineage — §7/H4), yet appending
 * `negateEvent(root)` yields EXCLUDED vs CONTRADICTORY. Divergence under a
 * later intervention is therefore permitted when the difference is LINEAGE; it
 * is not permitted when the difference is world structure, which is what
 * `group` is.
 *
 * NORMALIZED, so the fold matches what the derivation actually reads:
 *   - REQUIRES: `group ?? "0"` — the same default `buildModel` applies;
 *   - every other kind: `null` — `group` is ignored there (types.ts), so no
 *     derivation can read it and folding it in would discriminate on a label
 *     nothing can observe.
 */
export interface CanonicalEdge {
  id: string;
  kind: string;
  from: string;
  to: string;
  /** support-set label; REQUIRES only, `"0"` when omitted, `null` elsewhere */
  group: string | null;
}

/** The canonical semantic state of one derived world. */
export interface SemanticState {
  statuses: Record<string, EventStatus>;
  facts: CanonicalFact[];
  edges: CanonicalEdge[];
  workStatuses: Record<string, WorkStatus>;
  contradictions: CanonicalContradiction[];
  temporalViolations: TemporalViolation[];
  constraintViolations: ConstraintViolationRecord[];
}

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

/**
 * A resolved canon edge -> its world-semantic content. The ONE place the
 * normalization rule lives, so `derive` and any future consumer cannot drift.
 *
 * `note` is dropped (authorial flavor, same rule as `CardinalityConstraint.note`).
 * `group` is normalized to what the derivation actually reads: the default `"0"`
 * on REQUIRES (matching `buildModel`'s `edge.group ?? "0"`), and `null` on every
 * other kind, where `group` is ignored and therefore unobservable.
 */
export function canonicalizeEdge(edge: {
  id: string;
  kind: string;
  from: string;
  to: string;
  group?: string;
}): CanonicalEdge {
  return {
    id: edge.id,
    kind: edge.kind,
    from: edge.from,
    to: edge.to,
    group: edge.kind === "REQUIRES" ? edge.group ?? "0" : null,
  };
}

/**
 * Deduplicate by a key, deterministically and independently of input order.
 *
 * P-007 gate 3 — THE CARDINALITY CHOKEPOINT. `stateHash` folds these arrays;
 * `worldDiff` compares them as id-keyed Maps (facts, edges) and content-keyed
 * membership Sets (the three record dimensions). An array carries MULTIPLICITY
 * that neither of those views can observe, so before this function the hash saw
 * two entries where the diff saw one — and the invariant
 *
 *   worldDiff(A, B) empty  <=>  stateHash(A) === stateHash(B)
 *
 * broke, with a real value change becoming invisible. The rule that closes the
 * class, rather than any one instance of it: `stateHash` may fold ONLY what
 * `worldDiff` can compare.
 *
 * A duplicate id is a malformed world (canon rejects duplicate declarations, and
 * `overrideFact` now mints injectively). This collapses it IDENTICALLY on both
 * sides instead of pretending it cannot happen — sorting by (key, content) and
 * keeping the first makes the survivor a function of the SET of entries, never
 * of the order they arrived in.
 */
function dedupeBy<T>(records: T[], key: (record: T) => string): T[] {
  const sorted = [...records].sort(
    (a, b) => key(a).localeCompare(key(b)) || canonicalJson(a).localeCompare(canonicalJson(b))
  );
  const seen = new Set<string>();
  const out: T[] = [];
  for (const record of sorted) {
    const k = key(record);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(record);
  }
  return out;
}

/**
 * Project a WorldState onto its canonical semantic content.
 *
 * Pure and deterministic: every collection is deduplicated and sorted, so two
 * semantically identical worlds project onto byte-identical values regardless of
 * construction order — and, per `dedupeBy`, onto collections `worldDiff` can
 * compare element-for-element.
 *
 * LINEAGE IS SUBTRACTED, NOT SEMANTICS ENUMERATED. Each canonical record is the
 * whole record MINUS a named lineage set, so a field added to `FactView` or
 * `ContradictionRecord` is folded by default and only lineage is omitted. The
 * earlier form listed the semantic fields, which is an enumeration wearing
 * invariant clothing: the next field added would have been silently dropped from
 * world identity. The lineage sets are:
 *   - facts: `source` (canon vs derived), `overridden` (was it written)
 *   - contradictions: `source` (which intervention caused the record)
 * Both answer "how did this come to be", which is `identityHash`'s question.
 */
export function semanticState(world: WorldState): SemanticState {
  const facts: CanonicalFact[] = dedupeBy(
    world.facts.map((f) => {
      const { source: _source, overridden: _overridden, ...semantic } = f;
      return { ...semantic, validFrom: f.validFrom ?? null, validTo: f.validTo ?? null };
    }),
    (f) => f.id
  );

  const edges: CanonicalEdge[] = dedupeBy(
    world.edges.map((e) => ({ ...e })),
    (e) => e.id
  );

  const contradictions: CanonicalContradiction[] = dedupeBy(
    world.contradictions.map((c) => {
      const { source: _source, ...semantic } = c;
      return semantic;
    }),
    (c) => c.id
  );

  // The three RECORD dimensions are compared by full canonical content in the
  // diff (`contentSetDiff`), so content — not id — is the dedup key here.
  const temporalViolations: TemporalViolation[] = dedupeBy(
    [...world.temporalViolations],
    canonicalJson
  ).sort((a, b) => a.nodes.join(",").localeCompare(b.nodes.join(",")));

  const constraintViolations: ConstraintViolationRecord[] = dedupeBy(
    [...world.constraintViolations],
    canonicalJson
  ).sort(byId);

  return {
    statuses: world.statuses,
    facts,
    edges,
    workStatuses: world.workStatuses,
    contradictions,
    temporalViolations,
    constraintViolations,
  };
}
