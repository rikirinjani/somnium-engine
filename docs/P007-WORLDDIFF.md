# P-007 — WorldDiff Semantic Integrity

Branch `p007`, on merged `main` (`434f896`, P-006 in). Frozen
`somnium-p005-final` = `5b41deda` — untouched. Predictions pre-registered in
`experiments/p007/predictions.md` (commit `9f5245b`, before any implementation).
Ground truth in `experiments/p007/probes.ts` (11 pre-change probes) and
`experiments/p007/edge-probes.ts` (the §5 adversarial edge/identity cases).

Working under **NCR-005** (role-boundary deviation: the orchestrator
implemented this directly after five fixer dispatches failed at spawn with
`Insufficient balance`; the L2 gate remains an independent verifier lane).

**Central question, answered:** yes. `worldDiff` compares the canonical
semantic projection of two worlds and nothing else, and the invariant that
makes that claim checkable holds on every route on both seed canons.

---

## 1. The four failure diagnoses

| # | Test | Diagnosis | Class |
|---|------|-----------|-------|
| 1 | `src/diff/semantic.test.ts:321` (H5) | `expect(diffEmpty(d32)).toBe(w3.stateHash !== w2.stateHash)` — the invariant is an **equivalence**: empty diff ⟺ hashes **equal**. Written with `!==`, the assertion demanded a non-empty diff be empty. | **test defect** (mine) |
| 2 | `src/diff/semantic.test.ts:356` (H6) | The root event was guessed by substring-matching entity ids (`includes("blight") \|\| includes("death") \|\| includes("Dies")`). Ordos's root is `ev/old-warden-dies` — matches none of them — so the fixture was `undefined` and the test failed on its own construction, not on the claim. | **test defect** (mine) |
| 3 | `src/derive/ordering.test.ts:143` | Asserted `[sever,add]` and `[add,sever]` share a `stateHash` when statuses and facts coincide. P-007 folds the effective edge set into `stateHash`; the two chains leave **26 vs 25 edges**. The old expectation is invalidated **by design**, not broken by accident — see §4 for the evidence. | **obsolete expectation** |
| 4 | `tests/acceptance/cross-canon-acceptance.test.ts:582` | Asserted that writing the required fact back to its **own value** makes a Work `ALTERED`. That is ALTERED keyed on the `overridden` lineage flag — a write with no value change treated as a change to the world, exactly what P-007 forbids (D4). | **obsolete expectation** |

Nothing was bent to green. §4 and §6 are the executable evidence that 3 and 4
are obsolete rather than regressions; both rewritten tests assert the *same*
underlying claim through the corrected mechanism, with the architectural reason
recorded in the test body.

### 1b. A fifth failure, found by the NCR-005 sweep — my own false universal

While building the D4 evidence I wrote a cross-canon test claiming *"writing a
work-dependent fact back to its own effective value is invisible (diff
empty)"*. **Ordos falsified it.** Ordos's `(obj/seal-of-office, held_by)` cell
holds four windowed canon facts, and `fact/seal-held-galen` is a graph node
gating Galen's rite. A `setFact` on that cell does not merely assert a value —
it **fixes the cell**, which refutes the rival facts in it (P-004
`overriddenCells`). Measured:

```
fact/seal-held-galen        UNKNOWN -> UNSUPPORTED
ev/rite-of-binding-galen    UNKNOWN -> UNSUPPORTED
```

The fact's *value* did not change (no override, no ALTERED), but the world's
**modal structure** did: what was merely unknown became impossible. That is a
genuine world change, and INV correctly demands a non-empty diff.

The claim was scoped to what actually holds on both canons — *a same-value
write never flips a Work to ALTERED* — and the finding is now its own test pair
(`src/diff/semantic.test.ts`, "FINDING: a same-value write is a CELL
assignment…" plus the Verrin contrast, where the rival fact is not an edge
endpoint and the write therefore *is* invisible). This is the ncr-004 pattern
the sweep exists to catch: a passing fixture is not proof of a universal.

---

## 2. Formal definition of WorldDiff

> **WorldDiff(A, B) is the pairwise difference of the canonical semantic
> projections of two derived worlds.** It describes what changed *in the
> effective fictional world*, never what changed in the implementation records
> or the intervention history.

Mechanism (`src/derive/semantic.ts`): one projection, two consumers.

```
stateHash = hash({ canonId, canonHash, semantic: semanticState(world) })
worldDiff = pairwise comparison of semanticState(A) vs semanticState(B)
```

**INV — the invariant that makes the claim falsifiable.** For two worlds from
the same canon:

```
worldDiff(A, B) is empty  ⟺  stateHash(A) === stateHash(B)
```

It holds *by construction* because both sides read the same projection. The one
excepted direction is a 32-bit FNV-1a collision (~2⁻³² per pair); the diff
compares content, so it never hides a difference the hash collides on.

`SemanticState` = statuses · canonical facts · canonical edges · work statuses ·
canonical contradictions · temporal violations · constraint violations.

**Dropped as lineage:** `judgments.forced` / `.negated`, `facts.source` /
`.overridden`, `contradictions.source`, `rpId`, `interventions`, `edge.note`.
**Dropped as epistemics:** `judgments` themselves (see §7).

Pre-change, INV was false in **both** directions (probes P1–P11): provenance
leaked into `stateHash` (P3 idempotent write, P4 force-of-established both
moved the hash with an empty diff), and real semantic change was invisible (P6
severing a load-bearing edge, P7 constraint violations, P11 temporal
violations — all empty diffs).

---

## 3. Record churn vs semantic change

Empty diff **and** equal `stateHash`, both canons, all measured:

- idempotent `setFact` (same value) — `source: canon→derived` and
  `overridden: true` are lineage, no longer hashed;
- `forceEvent` on an already-ESTABLISHED event — `forced` is lineage;
- `severEdge` + `addEdge` net zero;
- double-force vs single force; both orders of set-like marks;
- `setFact` vs `relocate` writing the same cell to the same value;
- three writes ending on one value vs one write to that value;
- a no-op sever, a retract of a nonexistent fact, a malformed `addEdge`.

Conversely **not** churn, and correctly visible: a refused *fact* write. P-003
made contradictions first-class world state, so the refusal record is part of
what the world means. And the §1b cell-assignment case: a write whose value
changes nothing can still change the modal structure.

---

## 4. Are causal edges part of effective world state? — Yes

This is the architectural finding of P-007, and it deserves the weight.

**The measurement.** All ten §5 cases plus the edge-kind sweep are in
`experiments/p007/edge-probes.ts`. Severing any edge kind — REQUIRES, ENABLES,
PRECEDES, EXCLUDES, INVARIANT, or the deliberately inert MOTIVATES — moves
`stateHash` and produces exactly one `edgeChanges` entry with every other
dimension empty. On Verrin, *none* of those severs changes a single verdict
(the dependent becomes a root), which is precisely why the pre-P-007 diff was
empty for all of them.

**The decisive argument is counterfactual, not philosophical.** Take a
"dormant" edge — one whose presence changes no current verdict:

```
verrin:  add REQUIRES(ev/exodus -> ev/ember-ultimatum)
  statuses, facts, workStatuses: IDENTICAL to baseline

then apply the SAME later intervention (negate ev/exodus):
  with the edge:    ev/ember-ultimatum = UNSUPPORTED
  without the edge: ev/ember-ultimatum = ESTABLISHED
```

Ordos reproduces it with `REQUIRES(ev/vaela-invested -> ev/seal-survey)` and
`negate ev/vaela-invested`. Both are parameterized tests
(`src/diff/semantic.test.ts` D2, `src/diff/adversarial.test.ts`).

If `stateHash` excluded the causal law, these two worlds would be declared
**the same world** and then respond **differently to the same intervention**.
For a counterfactual engine that is not a cosmetic gap; it is a broken world
identity. So: **a causal law is part of world state even when its consequence
is currently dormant.** ALL edges belong, including kinds that contribute
nothing to any judgment — an authored MOTIVATES or PRECEDES is part of the
world's structure, and severing it is a change to the world even though no
verdict moves.

**What is *not* semantic, tested:** `edge.note` (authorial flavor, same rule as
`CardinalityConstraint.note`), key order (`canonicalJson` sorts), and a
**rejected** edge intervention — a malformed `addEdge` creates no edge and no
world change.

**The converse holds.** Same facts + same statuses + same edges + different
history ⇒ same `stateHash`, different `identityHash`, empty diff. Provenance
does not leak.

**Answer to the continuation's critical question — can WorldDiff explain a
causal-law change when the observed facts have not changed?** Yes, and
precisely. Severing Verrin's inert MOTIVATES yields:

```
edgeChanges: [{ edgeId: "edge/blight-motivates-oath", added: false,
                kind: "MOTIVATES", from: "ev/blight-begins", to: "ev/kael-oath" }]
```

and every other dimension empty. The law changed; the diff says so, and says
nothing else. When the law change *does* cascade, the direct change stays in
`edgeChanges` and the consequences appear in `statusChanges` /
`workStatusChanges` / `reachabilityChanges` — **separable by dimension, never
conflated** (§8).

---

## 5. `stateHash` / `identityHash` / `diff.hash`

| Hash | Question | Composition | Changed by P-007 |
|------|----------|-------------|------------------|
| `stateHash` | *Are these the same world?* | `canonId` + `canonHash` + `semanticState` | **Composition yes, meaning no.** Lineage removed, edges + constraint violations added. |
| `identityHash` | *Was this world reached the same way?* | `stateHash` + `rpId` + `canonicalInterventions` | **Formula unchanged** (its input value moves because `stateHash` did). |
| `diff.hash` | *Is this the same directed semantic difference?* | every diff field except `hash` | New composition (the delta dimensions). |

Verified separations: same world + different lineage ⇒ same `stateHash`,
different `identityHash`; `identityHash` equality implies `stateHash` equality
(it folds it) — asserted over every adversarial route; an empty diff always
carries the same identity as a self-diff.

The **contract for identical semantic diffs from different histories**: the
diff's identity is a function of the delta content alone, so two structurally
identical deltas hash identically regardless of how either endpoint was
constructed. `diff.hash` is a *directed* identity (§9), not an unordered one.

`computeRewindHash` / `RewindPoint.derivedHash` untouched.

---

## 6. `ALTERED` is value-semantic

Old rule: `allEstablished && overridden.some(workDependsOnFact)` — the
`overridden` **lineage flag**. New rule (`src/derive/world-state.ts`): a fact is
*altered-from-canon* iff its effective object **differs** from the canon fact
of the same id, or canon never declared that id.

Measured: same-value write ⇒ no alteration; different value ⇒ ALTERED;
different histories reaching the same value ⇒ same verdict, same `stateHash`,
empty diff, different `identityHash`. Every pre-existing ALTERED test stays
green — they all write genuinely different values.

**Ordos consequence, recorded because it is not obvious.** On Ordos the
`work.facts` requirement (`fact/seal-held-vaela`) is *also* a causal
prerequisite of a member event's rite. So a genuine value change refutes it and
the cascade reaches IMPOSSIBLE before ALTERED can apply — Ordos has no
value-based ALTERED route *through `work.facts`*. It still reaches ALTERED
through the other dependency rule (a fact its member events bring about:
`fact/vaela-warden`, anchored to `ev/vaela-invested`), which the rewritten test
now asserts. The `work.facts`→ALTERED route stays covered on a canon where the
required fact is not also a prerequisite (`world-state.test.ts`).

---

## 7. Status, contradiction, and the epistemic boundary

P-003 separated truth · support · forcedness · negation. P-007 does **not**
promote every transition to a diff entry.

- **In (semantic):** `statuses` — the world-semantic projection of judgments.
  ESTABLISHED→UNKNOWN, UNKNOWN→UNSUPPORTED, CONTINGENT→ESTABLISHED are changes
  in what the world *contains*.
- **Out (epistemic):** `judgments` themselves. `forced` and `negated` record
  *how* a verdict was produced — lineage. The one distinction `statuses` loses
  (UNFOUNDED vs NONE support, both projecting to UNKNOWN/UNSUPPORTED) is engine
  epistemics, and remains available on `WorldState.judgments` for consumers who
  want it.
- **Contradictions are semantic, their provenance is not.** The record is
  first-class world state (P-003, no silent repair); `source` — which
  intervention caused it — is dropped from the canonical view. So a
  contradiction diagnostic never redefines world identity via its lineage,
  while its *presence* legitimately does.

Contradiction dimensions use **content-set** semantics: introduced = records in
B whose full canonical content is absent from A. Two refused writes with
different phantom objects share a contradiction *id* and differ in content —
id-diffing would hide them; content-diffing reports one introduced and one
resolved, which is honest.

---

## 8. Direct vs derived consequences

The brief's question A/B/C: **C — both, in distinct dimensions.**

One `negateEvent` on a root yields, on both canons: >1 `statusChanges`
(downstream UNSUPPORTED), non-empty `workStatusChanges`, non-empty
`reachabilityChanges`. The direct write is not privileged and the derived
consequences are not summarized away. For a causal-law change: `edgeChanges`
carries the direct change, the status/work/reachability dimensions carry the
propagation. A consumer can separate "what I did" from "what followed" by
reading dimensions, without the diff having to label intent.

---

## 9. Directed diff — not an algebra

`diff(A, B)` and `diff(B, A)` are distinct directed objects: additions ↔
removals mirror, `from`/`to` swap, and the hashes differ. They are **structural
inverses**, not equal, and there is no claim that the unordered pair has one
identity.

Composition has **no general guarantee**, and the witnesses are constructed:

- **Cancellation.** `A→B` sever (non-empty `edgeChanges`), `B→C` re-add
  (non-empty), `A→C` **empty**. The composed legs do not reduce to the direct
  diff.
- **Non-composing dimension.** A contradiction introduced at B and resolved at
  C appears in both legs and in *neither* direction of `A→C`, while `A→C` is
  itself non-empty (the negation is a real change). The contradiction dimension
  does not compose even when the diff does not vanish.

The only justified guarantees are INV and determinism.

---

## 10. Occurrences, reachability, constraints

**Occurrences (D8).** No new dimension. Each occurrence is an event id with its
own verdict, so substitution is already visible: negating one of two same-type
occurrences produces a `statusChanges` entry for it and none for its sibling —
parameterized over both canons. EventType identity and Event occurrence
identity are not collapsed; the type-level aggregation (`setChanged` /
`substituted` / `typeCeased`) stays on the P-005 query surface
(`diffOccurrences`), which needs canon access `worldDiff` does not have.

**Reachability.** `reachabilityChanges` is derived from statuses
(`reachable` = ESTABLISHED ∨ CONTINGENT), so it cannot disagree with them. A
counterfactual that makes a canonical event unreachable reports both the status
change and the reachability flip; the reachability view exists because "can
this still happen?" is the question a reader asks, and it is not the same
question as "what is its verdict?".

**Constraint definition vs satisfaction (the P-006 residual) — three layers,
kept separate:**

| Layer | Where it lives | Is it a WorldDiff dimension? |
|-------|----------------|------------------------------|
| Constraint **definition** changed | the canon document (`canonHash`, folded into `stateHash`) | **No.** WorldDiff compares worlds, not laws-as-declared. A definition change is a new canon version. |
| Constraint **satisfaction** changed | `WorldState.constraintViolations` | **Yes** — `constraintViolationsIntroduced` / `Resolved`. |
| World state changed **because of** evaluation | nothing | **Nothing.** P-006's rule stands: a violation never mutates the world, never declares an event impossible, never becomes a contradiction. |

`AT_MOST_ONE(X)` with `occurrences(X) = 2` is therefore *definition unchanged,
satisfaction violated* — represented only in the satisfaction dimension.
Verified: forcing both Ordos rites introduces two violations with the canon
document untouched; stripping the constraints from the canon body changes
`canonHash` without touching any diff dimension. And because comparison is by
content, `observed=2` vs `observed=3` are different deltas despite sharing a
violation id (toy 3-occurrence canon).

---

## 11. Cross-canon evidence

Every universal is a parameterized test over `{verrin, ordos}` — the ncr-004
rule. No prose universals; no third canon; no canon-conditional code (source
scan for seed-canon literals in `src/**` executable code: clean).

- **INV sweep**, ~14 routes per canon (`semantic.test.ts`).
- **Adversarial sweep**, 21–23 routes per canon (`adversarial.test.ts`),
  asserting INV, criterion (A) history-only ⇒ empty, criterion (B) semantic ⇒
  non-empty, determinism, and the three-layer hash separation on every route.
- **D2** (causal law) and **D8** (occurrences) parameterized; **H3** cascade
  parameterized; **D4** parameterized where the claim survives both canons, and
  split into two canon-specific findings where it does not (§1b).

Where the canons genuinely differ, the difference is recorded as a finding
rather than smoothed into a false universal: Ordos's live rival facts in a
windowed cell, Verrin's inert ones; Ordos's cardinality constraints, Verrin's
unconstrained recurrence; Ordos declares no `located_in` and no MOTIVATES, so
those routes are canon-scoped by construction.

---

## 12. Adversarial results

`src/diff/adversarial.test.ts` enumerates the routes from the brief's §10 —
direct fact intervention, rejected intervention, force, negate, occurrence
creation/removal/substitution, cardinality violation created/resolved, causal
propagation, branch inheritance, equivalent derivations, different provenance,
convergent worlds, contradiction creation/removal, UNKNOWN preservation, edge
add/remove/inert — enumerated from the *brief* rather than from the
implementation, so a dimension the implementation forgot surfaces as an INV
violation instead of a passing fixture.

Result: **no route breaks INV on either canon.** Criterion (A) — different
construction history never manufactures a semantic diff — holds on all
history-only routes. Criterion (B) — semantic difference never hidden behind
similar writes — holds on all semantic routes.

---

## 13. NCR-005 disposition

Open, honored. The deviation was scoped to implementation; the L2 gate remains
an independent verifier lane and is a hard prerequisite. The sweep discipline
produced a real result: it caught my own over-broad D4 universal (§1b) before
the gate did, and it drove a repository-wide stale-claim sweep rather than a
known-file-list patch —
`docs/ARCHITECTURE-RECONNAISSANCE.md` §18.9 (`stateHash` composition), §18.10
case H (which chains converge), §11's P-001 `WorldDiff` sketch, and
`docs/P006-CARDINALITY.md`'s H1/H2 residual row are all updated with the
supersession recorded rather than silently rewritten.

No new NCR is warranted for the four failures: two were my own test defects
(fixed at the semantics), two were correctly-invalidated expectations with
evidence.

---

## 14. Verification

```
tsc --noEmit                exit 0
npm test                    566/566 passed, 24 files
npx tsx scripts/verify-facts.ts  ALL CHECKS PASSED (3/3)
determinism                 repeated derive: stateHash/identityHash/judgments/
                            facts/contradictions/temporalViolations identical
                            (capability 10, both canons); repeated worldDiff
                            byte-identical on every adversarial route
frozen tag                  somnium-p005-final = 5b41deda (untouched)
```

Baseline was 507. New: 59 tests (44 in `semantic.test.ts` incl. the D2 evidence
block, 12 in `adversarial.test.ts`, 3 added to `diff.test.ts`).

**Existing tests updated — 6, each a shape or mechanism update with the reason
recorded in the test body:** `diff.test.ts` (delta shape, FactDelta windows,
ContradictionDelta without lineage, real `edgeChanges` replacing the
reserved-empty assertion), `projections.test.ts` (fixture shape),
`query.test.ts` (new `edges` field), `poc-acceptance.test.ts` capability 8 and
`cross-canon-acceptance.test.ts` capability 9 (`workStatuses` snapshot →
`workStatusChanges` delta), `ordering.test.ts` (§1 #3), plus
`cross-canon-acceptance.test.ts` ALTERED (§1 #4). No semantic assertion was
weakened; the two invalidated ones were re-expressed through the corrected
mechanism and the P-004 invariant they used to carry was re-established on a
pair that genuinely converges.

---

## 15. Remaining risks

1. **A rejected `addEdge` is silent.** A malformed edge intervention is dropped
   by `resolveEdges` with **no contradiction record**, while a rejected *fact*
   write records one. The world is correctly unchanged, but the asymmetry means
   an incoherent edge intervention leaves no trace. P-003's "no silent repair"
   principle arguably applies. **P-008 candidate.**
2. **Same-id, different-content edges collapse.** `edgeChanges` emits one entry
   (`added: true`, branch content) when an id is reused with different content.
   Documented in `diff.ts`; `addEdge` replaces by id, so the case is reachable.
3. **32-bit hash space.** INV's ⟸ direction is modulo FNV-1a collisions
   (~2⁻³² per pair). Inherited from P-001, unchanged, now explicitly scoped.
4. **`work.facts`→ALTERED is canon-shape dependent.** Where the required fact
   is also a causal prerequisite, IMPOSSIBLE preempts ALTERED. Correct, but it
   means the ALTERED surface is thinner on Ordos than the rule suggests.
5. **`temporalViolations` ordering** is by node-set join. Deterministic, but the
   detector's own ordering is the only guarantee — a future multi-cycle canon
   should pin it explicitly.
6. **`diff.hash` is directed.** Anything caching diffs must not assume
   `hash(A,B) == hash(B,A)`.

---

## 16. Recommended P-008

**Intervention coherence records — close the silent-rejection asymmetry (risk
1), then attack the diff's *explanatory* adequacy.**

Two halves, in order:

1. **Rejection symmetry.** Every intervention kind that can be refused should
   record why, with one uniform record shape. Today: fact writes record,
   edge writes do not, `negate`/`force` cannot fail. The question to settle
   before coding: is a refused intervention part of the *world* (P-003's answer
   for facts) or part of its *lineage*? P-007 says contradictions are semantic
   and their `source` is not — the same split should apply to edge refusals.
2. **Explanatory adequacy.** P-007 proves the diff is *sound* (it reports
   exactly the semantic difference). It does not establish that the diff is
   *sufficient to explain* the difference: given `worldDiff(A, B)`, can a reader
   reconstruct *why* each derived change followed? That is a provenance-of-
   consequence question — distinct from intervention provenance, which stays out
   of world identity — and it is the natural next question for a counterfactual
   engine whose diffs are now trustworthy.

Explicitly **not** next: minimum-intervention search, narrative generation,
state-economy work, or a third canon. And S006 remains an independent research
baseline — untouched by P-007.
