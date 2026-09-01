# P-006 — Pre-implementation falsifiable predictions and ontology analysis

**Written BEFORE any implementation.** Every prediction is designed to be
falsifiable. The discipline that repeatedly caught me in P-003/P-005 applies:
a prediction that cannot fail is not a prediction, and a universal claim about
seed canons requires a parameterized test.

---

## 0. Ground truth measured at the frozen baseline (5b41ded)

- **No cardinality concept exists in the engine.** `git grep -i -E "cardinal|AT_MOST|AT_LEAST|EXACTLY_ONE" -- src` → 0 hits.
- Ordos constrains succession via **fact-level EXCLUDES** (`fact/seal-held-vaela` ⟂ `fact/seal-held-galen`), not via any type-level notion. Baseline: exactly one rite of binding and one investiture are ESTABLISHED; the other is UNKNOWN (case-K).
- Verrin's oaths are **unconstrained**: `type/oath-sworn` has 2 ESTABLISHED occurrences.

## 1. Falsifiable predictions

### A. Unconstrained recurrence
**Prediction A1.** An EventType with no cardinality constraint may have 0, 1, or
many occurrences with no diagnostic. Verrin's `type/oath-sworn` (2 ESTABLISHED)
must remain valid with zero new records under the new machinery.
*Falsified by:* any constraint diagnostic appearing for an unconstrained type.

### B. AT_MOST_ONE
**Prediction B1.** `AT_MOST_ONE(X)` with 0 occurrences → valid; 1 → valid; 2 →
a constraint violation that is **visible in the effective world** (not merely a
validation-time error).
**Prediction B2.** The violation is a **constraint violation**, distinct from
causal impossibility and from contradiction (§2).
*Falsified by:* 2-occurrence world reporting no violation, OR reporting the
violation only through a mechanism that doesn't touch the effective world.

### C. AT_LEAST_ONE
**Prediction C1.** `AT_LEAST_ONE(X)` is a different kind of constraint from
AT_MOST_ONE: it is satisfiable only when at least one occurrence is
ESTABLISHED, and a world with zero occurrences is a violation.
**Prediction C2.** It belongs in the generic vocabulary (the two canons between
them will demonstrate both directions: Ordos wants at-most; Verrin, if anything,
wants at-least-or-unconstrained).
*Falsified by:* showing that Verrin/Ordos never needs AT_LEAST_ONE, i.e. that
both canons can be fully expressed with only AT_MOST_ONE.

### D. EXACTLY_ONE
**Prediction D1.** EXACTLY_ONE = AT_LEAST_ONE ∧ AT_MOST_ONE (compositional, not
primitive). The engine must not need a third mechanism.
*Falsified by:* a case where composing the two bounds gives different behavior
from an explicit EXACTLY_ONE in a way that matters.

### E. Cardinality evaluated over occurrences, not writes
**Prediction E1.** A rejected/illegal write does not create an occurrence, so it
cannot trip a cardinality constraint. Cardinality reads the **effective derived
world** (occurrenceCount), not the intervention log.
*Falsified by:* a failed write changing the cardinality verdict.

### F. Branch independence
**Prediction F1.** Two branches from one canon are evaluated independently: one
may violate AT_MOST_ONE while the other is valid, and the violation in one does
not leak into the other.
*Falsified by:* a constraint verdict in branch A affecting branch B's world.

### G. Violation semantics (core question)
**Prediction G1.** A violated AT_MOST_ONE means: **the world is inconsistent
w.r.t. that constraint** — the violating extra occurrence is reported as a
constraint violation *in addition to* retaining its causal status. The world is
NOT silently mutated to "make it valid" (no auto-removal), and the event is NOT
declared impossible.
**Prediction G2.** The violation is recorded with provenance (the canonical
constraint id) and does NOT retroactively taint unrelated state.
*Falsified by:* auto-removal, silent validity, or tainting unrelated branches.

## 2. Causal impossibility vs constraint violation vs contradiction

| | Causal impossibility | Constraint violation | Contradiction |
|---|---|---|---|
| Meaning | A cannot occur: prerequisite absent/refuted | A *did* occur more times than canon permits | Canon asserts P and ¬P |
| Example | exodus requires blight; blight removed | two rites of binding, canon allows one | feast ⟂ famine, both established |
| Status today | UNSUPPORTED / EXCLUDED | **does not exist** | CONTRADICTORY / BOTH |
| Cause | causal graph | constraint over occurrence set | conflicting assertions |

**Prediction G3.** These three must remain distinguishable in the status map: an
event that is causally impossible, an event that violates cardinality, and an
event in a contradictory world must not collapse into one status.

## 3. Placement decision (hypothesis, to be justified)

**Hypothesis:** cardinality belongs in a **generic constraint layer**, attached
to the **EventType** — `AT_MOST_ONE(X)`, `AT_LEAST_ONE(X)` — evaluated over the
effective occurrence set per world. NOT in causal edges (they express support,
not counts), NOT in EventOccurrence (occurrences are instances, not holders of
type-level rules), NOT in WorldState (it is derived, not declared).

**Prediction P1.** A `CanonConstraint`-style declaration (EventType + bound)
is the smallest representation that both canons exercise: Ordos gets
AT_MOST_ONE on rite-of-binding/investiture; Verrin exercises unconstrained
recurrence and needs no constraint declaration.

## 4. EXCLUDES analysis (prediction)

**Prediction X1.** Ordos's fact-level `EXCLUDES(fact/seal-held-vaela, fact/seal-held-galen)`
does NOT faithfully represent `AT_MOST_ONE(rite-of-binding)`. It constrains a
different thing (who holds the Seal) and is satisfiable in worlds where the
rite constraint is violated.
**Prediction X2.** Fact-level EXCLUDES performs a genuine semantic job — mutual
exclusion of *facts/values* (at most one holder at a time) — which is a value
exclusivity constraint, distinct from occurrence cardinality.
**Prediction X3.** Both must coexist: EXCLUDES stays for value exclusivity;
cardinality is a new, separate axis. Neither subsumes the other.
*Falsified by:* a world where the two disagree yet the engine reports them as
one phenomenon.

## 5. Scope (prediction)

**Prediction S1.** The smallest generic scope required by the current canons is
**global per EventType** (`AT_MOST_ONE(X)` over all occurrences of X in the
world). No scoped form (per participant, per location, per interval) is
required by Verrin or Ordos. Scoping, if ever needed, is a documented
abstraction — not ad-hoc fields.
*Falsified by:* a canon task that cannot be expressed with global-per-type scope.

## 6. Temporal interaction (prediction)

**Prediction T1.** `X₁ PRECEDES X₂` under `AT_MOST_ONE(X)` is detected as a
**constraint violation** (two occurrences), independent of the PRECEDES edge —
the edge does not cause the violation, and the violation does not become a
temporal cycle.
**Prediction T2.** Temporal recurrence (X₁ → Y → X₂) is NOT a causal cycle and
is NOT a contradiction; it may be a cardinality violation if the type is
constrained, and nothing otherwise.
*Falsified by:* PRECEDES turning a recurrence into a cycle, or a temporal
diagnostic replacing a cardinality diagnostic.

## 7. Intervention semantics (prediction)

**Prediction I1.** `do(create X₂)` when X₁ exists under AT_MOST_ONE(X) is
**allowed to execute** but makes the world constraint-violating. Interventions
are not rejected to "protect" the constraint; the violation is reported.
**Prediction I2.** `do(remove X₁)` at a later depth **restores validity** —
cardinality is recalculated from the effective world at each depth, not
accumulated as a historical counter.
*Falsified by:* an intervention being blocked, or removal failing to restore
validity.

## 8. Multi-depth (prediction)

**Prediction M1.** Chain: create X₁ (valid) → create X₂ (violation) → remove X₁
(valid again). The final world must report zero violations.
*Falsified by:* the violation surviving X₁'s removal (i.e. a historical
counter).

## 9. Hash/diff (prediction)

**Prediction H1.** A cardinality violation changes `stateHash` (it is part of
the effective world) and appears in `WorldDiff` as a new constraint-diagnostic
record. `identityHash` continues to distinguish lineage from state.
**Prediction H2.** No hashing change is made for the sake of the new record;
P-004/P-005 hash semantics are preserved and tested.
*Falsified by:* violation not changing stateHash, or hashing being redefined.

## 10. Cross-canon (prediction)

**Prediction C3.** A parameterized test over `{verrin, ordos}` asserts the
documented per-canon constraint behavior. Verrin: unconstrained (no violation
at baseline). Ordos: AT_MOST_ONE satisfied at baseline, violated under a
2-occurrence intervention. **No prose-only universal claims** (ncr-004 rule).

## 11. Adversarial (prediction)

**Prediction A2.** After the implementation passes its own tests, adversarial
mutation routes are probed (§11 of the brief). The acceptance criterion: **all
representations of the effective world agree on the cardinality state** — the
constraint diagnostic, the occurrence query, and the status map must not
disagree (a diagnostic saying "invalid" while occurrenceCount still sees the
extra occurrence is a failure).

## 12. Non-goals

No task/agent state, workers, LLM, narrative generation, minimum-intervention
search, stochastic simulation, UI, canon datasets. No S006 baseline changes.
