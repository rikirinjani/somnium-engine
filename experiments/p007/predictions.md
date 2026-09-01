# P-007 — Falsifiable Predictions (written BEFORE implementation)

Baseline: merged `main` at `434f896` (P-006 in). Worktree branch `p007`.
Ground truth: `experiments/p007/probes.ts` (run 2026-09-01, output below) —
measurements of the CURRENT engine, taken before any P-007 change.

## 0. Measured ground truth (probes, pre-change)

| # | Probe | Measured result |
|---|---|---|
| P1 | `worldDiff(A, A)` | arrays empty, but `workStatuses` carries 3 keys — self-diff is NOT the identity |
| P2 | `setFact(char/vara, "not-a-predicate", "x")` | ACCEPTED (untyped predicate space; slash-free object = literal). +1 fact, stateHash moves. Not a refusal — the fact-rules differential only constrains subjects, `instance_of`, and id-shaped objects |
| P3 | idempotent `setFact` (same value) | stateHash MOVES (`source: canon→derived`, `overridden: true`), diff EMPTY |
| P4 | `forceEvent` on an already-ESTABLISHED event | stateHash MOVES (`forced: false→true`), diff EMPTY |
| P5 | sever + re-add same edge (net zero) | stateHash EQUAL, identityHash differs, diff EMPTY |
| P6 | sever a load-bearing REQUIRES edge | stateHash EQUAL, diff EMPTY — the event becomes a root and stays ESTABLISHED. The world's causal LAW changed; nothing observable did |
| P7 | Ordos: force both rites (cardinality violation) | stateHash moves, 2 violation records, diff shows 6 status changes but NO constraint dimension |
| P8/P9 | direction / composition probes | flattened by P6's inertness — must be re-probed with verdict-changing interventions |
| P10 | double force vs single force | stateHash AND identityHash both equal (set-like dedup) — correct |
| P11 | PRECEDES cycle among occurring events | 1 temporal violation, stateHash moves, diff EMPTY |

## 1. The central invariant (INV)

> For two worlds derived from the SAME canon:
> `worldDiff(A, B)` is empty (every delta array `[]`) ⟺ `stateHash(A) == stateHash(B)`.

Today this is false in both directions:

- stateHash moves with an empty diff (P3, P4: provenance leaks — `facts.source`,
  `facts.overridden`, `judgments.forced`; P11: missing temporal dimension;
  P1: workStatuses snapshot is carried, not compared);
- a diff-relevant semantic change is invisible (P6: the effective edge set is
  not on WorldState at all; P7: constraint violations have no diff dimension).

**Falsified by:** any same-canon pair with equal stateHash and a non-empty
diff, or vice versa. The test must sweep every §13 route over both seed canons.

## 2. The definition (H-series, per the brief)

**H1 — constraint changes are semantic world changes.** Prediction: the
answer SPLITS. A constraint *definition* change is a canon change (canonHash,
already folded into stateHash) and is NOT a WorldDiff dimension — WorldDiff
compares worlds, not laws. A constraint *satisfaction* change (the violation
set differs) IS a world-semantic change and MUST appear as
`constraintViolationsIntroduced` / `constraintViolationsResolved`. These are
two concepts (§4 of the brief) and must not be represented as one event.
**Falsified by:** forcing both Ordos rites yields a non-empty constraint delta
and a diff.hash change; a canon-edit that only adds a satisfied constraint
changes canonHash (stateHash) without touching any diff dimension.

**H2 — record churn is not semantic change.** Prediction: after
canonicalization, all of these produce an EMPTY diff AND equal stateHash:
idempotent `setFact` (P3), `forceEvent` on an ESTABLISHED event (P4),
sever+re-add net zero (P5), double-force vs single-force (P10), `setFact` vs
`relocate` writing the same cell. The world means the same thing; only the
write history differs.
**Falsified by:** any of these pairs yielding a non-empty diff or unequal
stateHash after the change.

**H3 — effective state change must be observable.** Prediction: one
`negateEvent` on a root event produces a cascade: many `statusChanges`
(downstream UNSUPPORTED), `workStatusChanges` (IMPOSSIBLE), reachability
flips — the diff reports ALL derived consequences, not just the direct
write. **Falsified by:** a downstream verdict change missing from the diff.

**H4 — provenance is not semantic state.** Prediction: two worlds with
different `identityHash` and the same effective state have an EMPTY diff
(P4's pair is the witness: forced-of-ESTABLISHED vs baseline). Lineage
difference is `identityHash`'s job, not WorldDiff's.
**Falsified by:** the P4 pair diffing non-empty after the change.

**H5 — constraint-only change has deterministic diff identity.** Prediction:
the P-006 residual case (Ordos, force both rites) produces a deterministic
`constraintViolationsIntroduced` entry; `diff.hash` changes exactly when the
canonical violation content changes — including the observed count (2 vs 3
rites must be DIFFERENT diffs despite the same violation id).
**Falsified by:** repeated diffs of the same pair differing, or observed=2 vs
observed=3 producing equal hashes.

**H6 — diff direction matters.** Prediction: `diff(A, B)` and `diff(B, A)`
are distinct directed objects (additions↔removals swapped, from/to swapped)
with DIFFERENT hashes. They are intentional structural inverses, not equal.
The hash identifies the directed delta; there is no claim that the unordered
pair has one identity.
**Falsified by:** `diff(A,B).hash === diff(B,A).hash` for a non-empty diff, or
swapped-entry asymmetry.

**H7 — diff composition is NOT an algebra.** Prediction: no general
composition guarantee. Witness (post-change): sever (B) then re-add (C) —
`diff(A,B)` and `diff(B,C)` are each non-empty (edgeChanges), `diff(A,C)` is
empty (cancellation). Also: a contradiction introduced at B and resolved at
C appears in both legs but neither introduced nor resolved in `diff(A,C)`.
The ONLY justified guarantees are INV + determinism.
**Falsified by:** any claimed composition law holding on constructed
counterexamples.

## 3. Dimension-level predictions (D-series)

**D1 — stateHash canonicalization.** stateHash folds ONLY world-semantic
content: `canonId, canonHash, statuses, canonicalFacts, workStatuses,
canonicalContradictions, temporalViolations, constraintViolations,
canonicalEdges`. Where:
- `canonicalFacts` = (id, subject, predicate, object, validFrom, validTo) —
  `source` and `overridden` are lineage, dropped;
- `canonicalContradictions` = (id, a, b, detail, detectedAt) — `source` is
  lineage, dropped;
- `canonicalEdges` = (id, kind, from, to) — `note` is canon-document flavor
  (same rule as `CardinalityConstraint.note`), dropped;
- `judgments` are NOT folded: the judgment model is the engine's epistemic
  evaluation; `statuses` is its world-semantic projection. The one distinction
  statuses lose (UNFOUNDED vs NONE support, both → UNKNOWN/UNSUPPORTED) is
  engine epistemics by the §5 analysis, and remains available on
  `WorldState.judgments` for consumers that want it.
**Falsified by:** INV failing on any route; or a forced/source/overridden-only
pair still moving stateHash.

**D2 — WorldState gains `edges`.** The effective post-intervention edge set
(resolveEdges output, canonicalized, sorted) is part of the world's meaning:
"the oath happens BECAUSE of the blight" vs "the oath is uncaused" are
different worlds even when every verdict coincides (P6). Folded into
stateHash; diffed as a real `edgeChanges` dimension (no longer reserved-empty).
**Falsified by:** P6's sever producing an empty diff after the change.

**D3 — workStatuses becomes a delta.** `workStatusChanges: {workId, from,
to}[]` replaces the branch snapshot (P1: a snapshot makes self-diff
non-identity and violates INV). depth.ts already compares worlds directly;
capability 9 and the diff tests are updated to the delta shape.
**Falsified by:** `worldDiff(A, A)` being non-empty, or a work-status change
missing from the diff.

**D4 — ALTERED becomes value-based.** Today `affectedByOverride` keys on the
`overridden` lineage flag: an idempotent write (value restored) flips a work
to ALTERED — record churn becoming semantic change, exactly what the brief
forbids. Prediction: value-based comparison against `canon.facts` by id (same
id + different object, or a derived id canon never declared ⇒ altered;
identical values ⇒ not altered) keeps every existing ALTERED test green (they
all write genuinely different values) and makes idempotent touch invisible.
**Falsified by:** an existing ALTERED test breaking, or idempotent touch on a
work-dependent fact still producing ALTERED.

**D5 — content comparison, not id comparison.** Every diff dimension compares
CANONICAL CONTENT, not ids. Measured counterexamples to id comparison:
`contra:ev/x:fact-write-illegal:instance-of-object-not-event-type` has the
same id for different phantom objects (different offender/detail);
`violation/constraint/rite-at-most-one` has the same id for observed=2 vs
observed=3. Id-diffing would hide semantic differences and break INV.
**Falsified by:** the phantom-pair or observed-2-vs-3 pair diffing empty.

**D6 — diff entries are canonical.** The diff is a semantic surface: its
fact entries carry content only (with validity windows — no more stripping),
its contradiction entries drop `source`. `diff.hash` = hash of the diff's own
canonical content (the "hash excludes itself" test is updated to the new
field list). Provenance never enters the diff.
**Falsified by:** a source/forced/overridden difference changing diff.hash.

**D7 — refused writes remain semantic.** A refused fact write adds a
contradiction record; P-003 made contradictions first-class world state, so
the diff reports it (`contradictionsIntroduced`). The world's meaning includes
its recorded incoherence. (P2's probe was NOT a refusal — see §0.)
**Falsified by:** a refused write diffing empty.

**D8 — occurrence identity needs no new dimension.** Occurrence changes are
visible as `statusChanges` (each occurrence is an event id with a verdict);
two different occurrence ids of one type both ESTABLISHED produce id-level
status entries — no collapse. The type-level aggregation (setChanged /
substituted / typeCeased) stays on the query surface (`diffOccurrences`) —
folding it into WorldDiff would require canon access worldDiff does not have
and would duplicate status information. INV does not depend on it.
**Falsified by:** an occurrence-substitution pair (one EXCLUDED, one
ESTABLISHED, same type) diffing empty.

**D9 — scope of INV.** The invariant is claimed for SAME-canon pairs only.
Cross-canon pairs can have equal diff content and different stateHash
(canonHash differs — different laws, same observable content). That is
correct: they are different worlds. H1's definition/satisfaction split is
the same distinction.
**Falsified by:** (nothing to construct — this is a scoping claim; the test
suite asserts INV only within a canon.)

**D10 — determinism.** All new dimensions are sorted by id then content;
hashes via canonicalJson. Repeated `worldDiff(A, B)` yields byte-identical
entries, ordering, and hash. No reliance on map iteration order.
**Falsified by:** repeated diffs differing in any byte.

## 4. What must NOT change

- `identityHash` semantics (stateHash + rpId + canonicalInterventions) —
  lineage identity is untouched (its stateHash INPUT value changes, its
  definition does not).
- The judgment model, propagation, taint discipline, fact rules — P-007
  touches hashing, diffing, work classification's ALTERED rule, and
  WorldState's surface. No propagation semantics.
- The frozen `somnium-p005-final` tag (git-level; untouched).
- No canon-conditional code: the source-scan rule (no seed-canon id literals
  in executable code) holds; every "both canons" claim is a parameterized
  test (ncr-004 rule).
- No scope expansion (§14): no tasks/agents/LLM/narrative/UI/state-economy.

## 5. Test-count expectation

507 baseline. New: the INV sweep + dimension tests + adversarial routes,
parameterized over both canons where a universal is claimed. Updated (not
bent — each update is listed in the report): diff.test.ts (workStatuses →
workStatusChanges, hash field list, fact entry shape), projections.test.ts
(diff literals), capability 9 (delta shape), world-state.test.ts (only if a
test pins a pre-canonicalization hash behavior — none found in the blast
radius; all hash assertions are relative).
