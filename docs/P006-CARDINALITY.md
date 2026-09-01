# P-006 — Constraint-Layer Cardinality

**Baseline:** frozen `somnium-p005-final` (`5b41ded`), branched `p006`.
**Predictions:** `experiments/p006/predictions.md` (written before implementation).
**Status:** implemented, 507/507 tests, tsc clean, verify-facts 3/3.

## 1. Falsifiable predictions (summary of outcomes)

| # | Prediction | Outcome |
|---|---|---|
| A1 | Unconstrained type: 0/1/many occurrences, no diagnostic | **CONFIRMED** (Verrin oath-sworn, count 2, zero records) |
| B1 | AT_MOST_ONE: 0/1 valid, 2+ violation visible in effective world | **CONFIRMED** (Ordos: baseline 1 → 0 violations; force 2 → violation) |
| B2 | Violation is a constraint violation, distinct from causal/contradiction | **CONFIRMED** (§2 table; distinct record kind `violation/…`) |
| C1 | AT_LEAST_ONE: 0 violates, 1+ valid | **CONFIRMED** |
| C2 | Both directions needed by the canons → generic vocabulary | **PARTIALLY SUPPORTED** — Ordos needs AT_MOST_ONE; Verrin needs neither. AT_LEAST_ONE is generic but not canon-exercised. Kept (compositional with AT_MOST_ONE). |
| D1 | EXACTLY_ONE = AT_LEAST_ONE ∧ AT_MOST_ONE | **CONFIRMED** (compositional, no third primitive) |
| E1 | Evaluated over occurrences, not writes | **CONFIRMED** (rejected writes don't create occurrences) |
| F1 | Branch independence | **CONFIRMED** |
| G1 | Violation does not silently mutate; extra occurrence keeps status | **CONFIRMED** |
| G2 | Provenance recorded; no unrelated taint | **CONFIRMED** |
| G3 | Three phenomena remain distinguishable | **CONFIRMED** (UNSUPPORTED / violation record / CONTRADICTORY) |
| P1 | Placement on EventType via Canon.constraints | **CONFIRMED** (generic layer, both canons' shape) |
| X1 | Ordos fact-EXCLUDES ≠ AT_MOST_ONE(rite) | **CONFIRMED** (they constrain different axes) |
| X2 | EXCLUDES does a genuine job (value exclusivity) | **CONFIRMED** (kept) |
| X3 | Both coexist | **CONFIRMED** |
| S1 | Global per-type is the smallest scope both canons need | **CONFIRMED** (no scoped form required) |
| T1/T2 | PRECEDES recurrence ≠ causal cycle ≠ contradiction; may be cardinality violation | **CONFIRMED** |
| I1 | Creating a 2nd occurrence is allowed but flags the world | **CONFIRMED** |
| I2 | Removing restores validity (no historical counter) | **CONFIRMED** (M tests) |
| H1/H2 | Violation changes stateHash; identityHash semantics preserved | **CONFIRMED** |
| C3 | Parameterized cross-canon baseline test | **CONFIRMED** (ncr-004 rule) |
| A2 | All world representations agree on cardinality state | **CONFIRMED** (K tests assert diagnostic.observed === query count) |

## 2. Cardinality ontology

- **Unconstrained recurrence** is the default. Sharing an EventType implies
  nothing. (Verrin's oaths: 2 occurrences, no record.)
- **AT_MOST_ONE**: 0–1 occurrences permitted; excess is a violation.
- **AT_LEAST_ONE**: 0 is a violation; 1+ valid.
- **EXACTLY_ONE**: compositional (D). No third primitive.
- **Scope**: global per EventType. Scoped forms (per participant/location/
  interval) are NOT required by the current canons (S1). If a future canon
  needs them, that is a documented extension, not ad-hoc fields.

## 3. Placement decision

**Location: a generic constraint layer on the Canon** — `Canon.constraints:
CardinalityConstraint[]`, each `{ id, typeId, bound }`, evaluated over the
effective occurrence set of every derived world.

Why this location:
- Not in **causal edges**: edges express support/causation, not counts.
- Not in **EventOccurrence**: occurrences are instances; a type-level rule
  about their count is not a property of any single instance.
- Not in **WorldState**: WorldState is *derived*; the constraint is *declared*.
- Not in **validation only**: a cardinality violation is a per-world property
  (branch A may violate while branch B is valid), so it must be evaluated in
  `derive()`, not at canon-load time.

The constraint is folded into `stateHash` (it is part of the effective world),
while `identityHash` continues to distinguish lineage — both P-004/P-005 hash
semantics preserved and re-tested (H tests).

## 4. Causal impossibility vs constraint violation vs contradiction

| | Causal impossibility | Constraint violation | Contradiction |
|---|---|---|---|
| Meaning | A cannot occur: prerequisite absent/refuted | A occurred more/less often than canon permits | Canon asserts P and ¬P |
| Status | `UNSUPPORTED` / `EXCLUDED` / `UNKNOWN` | **`constraintViolations` record** (`violation/…`) | `CONTRADICTORY` (`BOTH`) |
| Record | — | `ConstraintViolationRecord` (typeId, bound, observed, limit) | `ContradictionRecord` (`contra:…`) |
| Example | x2 requires a refuted prerequisite | two rites of binding, canon allows one | feast ⟂ famine, both established |

**Confirmed by the G test**: a world with a constraint violation has zero
contradictions and zero impossible events; the violating occurrences keep their
causal status. The three phenomena never collapse into one.

## 5. EXCLUDES analysis

Ordos's `EXCLUDES(fact/seal-held-vaela, fact/seal-held-galen)` does NOT
represent `AT_MOST_ONE(rite-of-binding)`:

- It constrains **who holds the Seal** (a value-exclusivity constraint: at most
  one holder), which is satisfiable in worlds where the rite constraint is
  violated (J test: forcing both rites yields BOTH a `violation/…` record AND a
  `contra:…excludes` record — two different phenomena).
- EXCLUDES is retained: it performs the genuine job of value exclusivity.
- Cardinality is a separate axis. Neither subsumes the other.

## 6. Scope decision

**Global per EventType.** No per-participant, per-location, or per-interval
scope is required by Verrin or Ordos (S1). Documented as the smallest generic
scope; scoped forms are a future abstraction, not ad-hoc fields.

## 7. Temporal interaction

- `X₁ PRECEDES X₂` under `AT_MOST_ONE(X)` → cardinality violation, **not** a
  temporal cycle (T1: `temporalViolations` empty, `constraintViolations` = 1).
- Recurrence `X₁ → Y → X₂` is not a causal cycle and not a contradiction
  (T2: no `temporalViolations`, no contradictions, only the cardinality
  record if the type is constrained).

## 8. Intervention semantics

- `do(create X₂)` when X₁ exists under AT_MOST_ONE → **allowed**, world becomes
  violation-flagged. Interventions are not blocked to "protect" constraints.
- `do(remove X₁)` → **restores validity** (I2/M: cardinality recomputed from the
  effective world each depth, no historical counter).

## 9. Multi-depth findings

M tests: create X₁ → valid; create X₂ → violation; remove X₁ → valid again.
A later branch legitimately removes an earlier occurrence and returns to a
valid cardinality state. Cardinality is per-world, recalculated from the
effective occurrence set — NOT an accumulating historical counter.

## 10. Hash/diff findings

- A violation changes `stateHash` (effective world includes it).
- `identityHash` still folds lineage on top and distinguishes
  same-world/different-history (H test: `derive(c,[i]).identityHash ===
  derive(c,[i]).identityHash` while stateHash differs between valid/invalid).
- No hashing change was made for the sake of the record; P-004/P-005 semantics
  preserved.

## 11. Cross-canon results

Parameterized test (ncr-004 rule): `{verrin: 0 violations, ordos: 0 violations}`
at baseline; every declared constraint references a real EventType. Verrin
exercises unconstrained recurrence; Ordos exercises the constrained case.

## 12. Adversarial route results (K tests)

- Direct fact intervention (`retractFact` on an `instance_of` fact) reduces the
  count and can restore validity.
- Forced + negated facts are reflected in the count.
- Undeclared references (ghost) never become occurrences; a ghost forced as a
  REQUIRES source correctly UNSUPPORTEDs its dependent, and the count reflects
  exactly the effective occurrences.
- Multiple causal paths to one occurrence count once.
- **Agreement criterion met**: `diagnostic.observed === occurrenceQueryCount`
  in every K test.

## 13. Verification

- 479 baseline tests unchanged and green; 28 new constraint tests.
- `tsc --noEmit` exit 0. `verify-facts` 3/3. Deterministic (stateHash stable
  across re-derives).
- Frozen `somnium-p005-final` untouched (still `5b41ded`).

## 14. Remaining risks

1. **AT_LEAST_ONE is generic but canon-unexercised** (C2 partially supported).
   It is compositional and unit-tested; only a third canon would exercise it
   for real.
2. **Scoped cardinality** (per participant/location) is untested-by-canons; the
   global scope decision may need revisiting when a canon demands scoping.
3. **Violation severity is uniform** — there is no "minor vs major" violation.
   Not needed by current canons.
4. The constraint layer reads occurrenceCount, which reads effective facts; a
   future multi-valued `instance_of` (P-005 §19.11 item 3) could change what
   "one occurrence" means.

## 15. Recommended P-007

**Constraint-layer composition and precedence.** With cardinality now a third
constraint axis (alongside EXCLUDES value-exclusivity and INVARIANT), the
engine has three ways to express "these things cannot both be true". P-007
should test their interaction: a world violating EXCLUDES and AT_MOST_ONE
simultaneously (already observable in the J test) — and decide whether a
constraint *diagnostic* should ever taint truth (currently it does not, by
design). The natural stress is a canon where the same outcome is protected by
two different constraint kinds, to verify the layers remain orthogonal.

Alternatively, if a third canon is eventually wanted, cardinality scoping is the
first feature that would genuinely require one.
