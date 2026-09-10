/**
 * Somnium Engine — the authoritative semantic representation (P-007 convergence).
 * DESIGN: docs/P007-CONVERGENCE.md. Single source of truth for what a derived
 * world MEANS; both `stateHash` and `worldDiff` derive from this and nothing else.
 *
 *   EffectiveSemanticState (this table IS the representation)
 *        ├── stateHash       hashes it
 *        └── semanticDelta   compares two of them (repr-only signature, ▲2)
 *
 * Four L2 gates each found one level of divergence between the hash's view and
 * the diff's view (field content → value comparison → collection cardinality →
 * field enumeration). Root cause: two independently hand-written
 * implementations of one comparison. Here there is ONE representation and ONE
 * generic comparison; the per-dimension knowledge that remains is exactly this
 * table: each dimension's (key, record) pairs.
 *
 * STRUCTURAL RULES (each makes a gate finding inexpressible):
 *   1. Every dimension is a keyed map built by THIS module — multiplicity is
 *      not expressible (gate 3's class).
 *   2. A key collision with DIFFERENT content is a HARD ERROR (review ▲1): a
 *      legal world must never fail to derive, so a collision can only be a key
 *      defect in this table. Identical duplicates collapse idempotently.
 *      Ordos TODAY makes two held_by facts co-effective in one cell under
 *      negate(ev/old-warden-dies) — too-coarse keys are exposed by legal worlds.
 *   3. Keys can never break hash/diff AGREEMENT (both read this same map); a
 *      wrong key breaks FAITHFULNESS, and rule 2 detects that at construction.
 *   4. "No information" has one encoding: UNKNOWN entries are ABSENT from the
 *      statuses/workStatuses dimensions. Query surface unchanged (`statusOf`
 *      still answers UNKNOWN for absent keys).
 *   5. Lineage is SUBTRACTED, never enumerated: a field added to `FactView` or
 *      `ContradictionRecord` reaches world identity by default.
 *
 * Determinism: plain nested objects; `canonicalJson` sorts every key
 * recursively, so representation equality is exactly canonical-JSON equality
 * for any construction order.
 */
import { canonicalJson } from "../canon/hash";
import type { TemporalViolation } from "./propagation";
import type { ConstraintViolationRecord } from "./constraints";
import type { WorldState } from "./world-state";

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

/** An edge's world-semantic content: the causal law, without its note. */
export interface CanonicalEdge {
  id: string;
  kind: string;
  from: string;
  to: string;
  /** support-set label; REQUIRES only, `"0"` when omitted, `null` elsewhere */
  group: string | null;
}

/**
 * One dimension's declaration: how the world's (key, record) pairs are
 * produced. THE ONLY per-dimension knowledge in the engine — adding a semantic
 * dimension means adding a row, and stateHash and worldDiff both see it with no
 * further per-dimension code anywhere.
 */
interface DimensionDecl {
  name: string;
  entries: (world: WorldState) => readonly (readonly [string, unknown])[];
}

/**
 * THE DECLARATION TABLE. Lineage sets are subtracted here, per dimension:
 *   facts: `source` (canon vs derived), `overridden` (was it written)
 *   contradictions: `source` (which intervention caused the record)
 * Both answer "how did this come to be" — `identityHash`'s question, not the
 * world's. Contradictions/constraints/temporal are CONTENT-keyed (P-003/D5):
 * the record is the fact; same id + different content = two entries.
 */
const DIMENSIONS: readonly DimensionDecl[] = [
  {
    name: "statuses",
    entries: (w) =>
      Object.entries(w.statuses)
        .filter(([, status]) => status !== "UNKNOWN") // "no information" is absent
        .map(([id, status]) => [id, status] as const),
  },
  {
    name: "facts",
    entries: (w) =>
      w.facts.map((f) => {
        const { source: _s, overridden: _o, ...semantic } = f;
        return [f.id, { ...semantic, validFrom: f.validFrom ?? null, validTo: f.validTo ?? null }] as const;
      }),
  },
  {
    name: "edges",
    entries: (w) => w.edges.map((e) => [e.id, { ...e }] as const),
  },
  {
    name: "workStatuses",
    entries: (w) =>
      Object.entries(w.workStatuses)
        .filter(([, status]) => status !== "UNKNOWN")
        .map(([id, status]) => [id, status] as const),
  },
  {
    name: "contradictions",
    entries: (w) =>
      w.contradictions.map((c) => {
        const { source: _s, ...semantic } = c;
        return [canonicalJson(semantic), semantic] as const;
      }),
  },
  {
    name: "temporalViolations",
    entries: (w) => w.temporalViolations.map((t) => [canonicalJson(t), t] as const),
  },
  {
    name: "constraintViolations",
    entries: (w) => w.constraintViolations.map((v) => [canonicalJson(v), v] as const),
  },
];

/** The names, in table order — the canonical dimension enumeration. */
export const DIMENSION_NAMES: readonly string[] = DIMENSIONS.map((d) => d.name);

/**
 * The authoritative representation: dimension name -> (key -> record).
 * Plain nested object so `canonicalJson` gives one deterministic encoding.
 */
export type EffectiveSemanticState = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/**
 * Build the representation. THROWS on a key collision with differing content
 * (review ▲1) — that is a key defect in the table exposed by a legal world,
 * and deriving a wrong identity is the one outcome that must never happen
 * silently.
 */
export function effectiveSemanticState(world: WorldState): EffectiveSemanticState {
  const repr: Record<string, Record<string, unknown>> = {};
  for (const dim of DIMENSIONS) {
    const entries: Record<string, unknown> = {};
    for (const [k, record] of dim.entries(world)) {
      const prior = entries[k];
      if (prior !== undefined && canonicalJson(prior) !== canonicalJson(record)) {
        throw new Error(
          `semantic dimension "${dim.name}" has two different records for key "${k}" — ` +
            `a key defect in the semantic declaration table, exposed by a legal world; ` +
            `refusing to derive a wrong identity`
        );
      }
      entries[k] = record;
    }
    repr[dim.name] = entries;
  }
  return repr;
}

/** Typed accessor: one dimension's records, sorted by key (deterministic). */
export function dimensionEntries<T>(repr: EffectiveSemanticState, name: string): T[] {
  const entries = repr[name];
  if (entries === undefined) throw new Error(`unknown semantic dimension "${name}"`);
  return Object.keys(entries)
    .sort()
    .map((k) => entries[k] as T);
}

/** Legacy alias — both consumers and existing tests use this name. */
export const semanticState = effectiveSemanticState;

/** A resolved canon edge -> its world-semantic content (the one normalization owner). */
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
