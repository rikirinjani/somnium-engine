# S011 — Fold-State Delta / Retention Signal

**Verdict: PASS** (with documented limitations: over-retention and instrumentation cost)

The authoritative fold can expose a per-intervention **fold-state delta** that is (a) produced *by the fold itself*, (b) catches both the S009 and S010 witnesses generically with no special-casing, (c) yields a **sound** retention on 520/520 differential cases across three canons, and (d) survived an inverse-attack search with **0** counterexamples. The signal is **necessary** for safe retention but **not** a proof of minimality — it over-retains.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **PASS** |
| Necessary? | Yes — 0 empty-delta-but-future-relevant cases in the corpus |
| Sufficient for *safe* retention? | Yes — retention by delta is sound on 520/520 |
| Sufficient for *minimality*? | **No** — category C (fold-changed, ultimately irrelevant) exists |
| Semantic authority singular? | Yes — the delta is recorded by the fold; no second engine |
| Cost | 2.2× (H=10) → 57.7× (H=3000) — a real limitation |

## 2. Research question

> Does the authoritative fold need to expose a per-intervention signal describing whether the intervention changed fold-relevant state — and is that signal a sound foundation for sufficient-history extraction?

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `443d3d9` (frozen P-007) |
| Branched from | `443d3d9` — not S007–S010 |
| Worktree | `C:\Users\think\Project_v2\Somnium-s011` |
| Branch | `s011` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Frozen Verrin | `e4c79cec` ✅ |
| Frozen Ordos | `51f32b2e` ✅ |
| Working tree at start | clean |

Re-checked **after** instrumentation: 624/624, verify-facts 3/3, both frozen hashes unchanged — the instrumentation is semantics-preserving.

## 5. Authoritative fold dependency map

```text
intervention
    ↓
fold state mutation
    ↓
state components
    ↓
future intervention observability
```

| Component | Owner | Mutated by | Consulted by later steps? |
|---|---|---|---|
| `negated: Set` | `buildModel` (propagation.ts) | `negateEvent` | yes — truth, later force/negate |
| `forcedBy: Map<target,id>` | `buildModel` | `forceEvent` | yes — truth, later negate |
| `retracted: Set` | `buildModel` | `retractFact` | yes — fact truth, effective facts |
| `overriddenCells: Map<cell,value>` | `buildModel` | `setFact`/`relocate` | yes — fact truth |
| `rejectedFactWrites` | `buildModel` | illegal `setFact`/`relocate` | yes — contradictions |
| `edges` | `resolveEdges` | `severEdge`/`addEdge` | yes — node set, support groups |
| effective fact list | `applyFactInterventions` | `setFact`/`relocate`/`retractFact` | yes — `overrideFact` id reuse |
| `semanticState` | projection over the above | — | **no** — it is an output |

**The projection is not the fold state.** S009/S010 proved `effectiveSemanticState` omits `negated`/`forcedBy`/`retracted`/`overriddenCells`; the accumulator set omits effective-fact id provenance. Both are needed, and both are owned by the fold.

## 6. Definition of `FoldStateDelta`

```ts
interface FoldStepDelta {
  index: number;
  kind: string;
  target: string;
  components: string[];   // which fold-state parts THIS step changed; [] = none
}
```

`components` is the union of:
- the accumulator components `buildModel`'s fold changed — `negated`, `forcedBy`, `retracted`, `overriddenCells`, `rejectedFactWrites`, `edges`; and
- whether `applyFactInterventions`'s effective-fact list changed — `facts`.

It is **not** "did the semantic world change" (S010 proved that insufficient) and **not** "did one accumulator change" alone (S009 proved that insufficient). It is recorded **as the fold runs**.

## 7. Instrumentation architecture

Narrowly scoped `src/` changes only (permitted by the S011 brief):

| File | Change |
|---|---|
| `src/derive/propagation.ts` | `resolveEdges` records whether each sever/add changed the edge set; the accumulator fold records `components` per step; new `buildModelWithDeltas` shares the *same* fold body as `buildModel` (which delegates). |
| `src/derive/world-state.ts` | `applyFactInterventions` records whether each step changed the fact list; new exported `foldStateDeltas(canon, interventions)`. |

No semantic rule is duplicated: the delta is emitted from inside the existing fold loops. `buildModel`'s signature and behaviour are unchanged (it calls the internal fold without a delta sink).

## 8. S009 reproduction

Overlap canon (`char/x` has two simultaneously-effective facts), history `setFact(W1) → retract(f2) → setFact(W2)`:

| # | op | components | changed |
|---|---|---|---|
| 0 | `setFact:char/x` | `overriddenCells, facts` | ✅ |
| 1 | `retractFact:fact/x-at-loc2` | `retracted, facts` | ✅ |
| 2 | `setFact:char/x` | `overriddenCells, facts` | ✅ |

All three are retained, so the unsafe S008 reduction (which dropped #0) cannot occur. **No NCR-006 special case** — the delta falls out of the fold's own `overriddenCells`/`facts` observation.

## 9. S010 reproduction

Seed canon verrin, history `forceEvent(ev/maren-return) → negateEvent(ev/maren-return)`:

| # | op | components | semantic hash before → after |
|---|---|---|---|
| 0 | `forceEvent:ev/maren-return` | `forcedBy` | `f0185e63 → f0185e63` (**unchanged**) |
| 1 | `negateEvent:ev/maren-return` | `negated` | `f0185e63 → 1a8fe542` |

The `forceEvent` is a **semantic no-op** (identical hash) yet reports `forcedBy` — exactly the signal S010's M-H could not see. And it matters: `[force, negate] = 1a8fe542` ≠ `[negate] = 527b18df`. **No `forceEvent` special case.**

## 10. Inverse attack results

The adversarial question: *is there an intervention whose delta is empty yet whose removal changes the final world?* That is precisely where a retention signal would be unsound.

Searched all steps of 1,533 histories across three canons (constructed + random, including multi-fact, invalid, contradiction and edge cases):

**0 hits.**

So in this corpus, an empty delta implies future-irrelevance — the delta is **necessary**. (Empirical, not a proof.)

## 11. Complete vocabulary coverage

Retention failures per operation: **0 for every operation on every canon.**

| Operation | verrin tested / changed / empty | ordos | overlap |
|---|---|---|---|
| `setFact` | 4993 / 4978 / 15 | 4993 / 4974 / 19 | 4993 / 3341 / 1652 |
| `relocate` | 1 / 1 / 0 | 1 / 1 / 0 | 1 / 1 / 0 |
| `negateEvent` | 1890 / 1644 / 246 | 1890 / 1623 / 267 | 1890 / 1099 / 791 |
| `forceEvent` | 1915 / 1674 / 241 | 1915 / 1652 / 263 | 1915 / 1103 / 812 |
| `retractFact` | 1517 / 1365 / 152 | 1517 / 1388 / 129 | 1517 / 808 / 709 |
| `severEdge` | 1228 / 1171 / 57 | 1228 / 1171 / 57 | 1228 / 830 / 398 |
| `addEdge` | 1000 / 38 / 962 | 1000 / 46 / 954 | 1000 / 327 / 673 |

`addEdge` is mostly empty-delta (re-adding an identical edge is a fold no-op) — correctly so. **`relocate` has thin evidence (1 case)** and is marked as such.

## 12. Semantic vs fold-state vs future-observability

Per-step classification over 37,632 steps:

| Category | semantic | fold | future-relevant | count |
|---|---|---|---|---|
| **A** | yes | yes | yes | 19,990 |
| **B** | **no** | yes | **yes** | **621** |
| **C** | no | yes | no | 2,692 |
| **D** | no | no | no | 14,329 |

- **Category B exists (621 cases)** — the S010 class. A semantic no-op that changes fold state and matters later. This is the dimension S010's M-H could not see.
- **Category C exists (2,692 cases)** — fold-changed but ultimately irrelevant. These are *safe over-retention*, and they are why the signal is **not minimal**.
- **Category D (14,329)** — the genuinely discardable class.
- **No step was semantic-changed with an empty fold delta** — consistent with the delta being necessary.

## 13. Retention simulation

`retain(H) = H.filter(step has non-empty delta)`. Deliberately the simplest possible rule; no optimisation.

Result: sound on every canon (see §14). It is a **conservative** retention — it keeps category C along with A and B.

## 14. Differential equivalence

`derive(H)` vs `derive(retain(H))` — `effectiveSemanticState`, `stateHash`, directed `WorldDiff`:

| Canon | Cases | Equivalent |
|---|---|---|
| verrin | 520 | **520 / 520** |
| ordos | 520 | **520 / 520** |
| overlap (multi-fact) | 520 | **520 / 520** |

Corpus: 13 constructed (including invalid, contradiction and the S010 witness) + 500 random histories per canon. **Retention driven by the fold-state delta is sound on the tested corpus.**

## 15. Branch isolation

| Canon | isolation | legacy match |
|---|---|---|
| verrin | ✅ | ✅ |
| ordos | ✅ | ✅ |

`foldStateDeltas` is pure (no shared mutable state); computing a prefix's deltas is unaffected by reducing any branch.

## 16. Determinism

| Canon | delta sequence stable over 5 trials |
|---|---|
| verrin | ✅ |
| ordos | ✅ |

The delta is a canonical-JSON-comparable array of `{index, kind, target, components}`; no object references or `Map` iteration order leak into it.

## 17. Performance overhead

`derive(H)` vs `foldStateDeltas(H)`:

| H | verrin plain | verrin instr | overhead | ordos overhead |
|---|---|---|---|---|
| 10 | 0.5 ms | 1.0 ms | 2.2× | 2.0× |
| 100 | 2.2 ms | 21.2 ms | 9.7× | 16.6× |
| 1,000 | 19.4 ms | 880 ms | 45.4× | 62.7× |
| 3,000 | 64.9 ms | 3,740 ms | **57.7×** | 33.5× |

The cost is dominated by the effective-fact-list comparison in `applyFactInterventions` (a `canonicalJson` of the fact list per step → O(H × facts)). This is a **first, correctness-first implementation**, not an optimised one. The delta recording itself (accumulators) is O(1) per step; only the fact-list observation is expensive and it can be made incremental.

## 18. Architectural boundary analysis

Desired: `intervention → authoritative fold → { semantic projection, fold state, fold-state delta } → retention`.

**This is what was built.** The delta is emitted from *inside* the fold's own loops (`buildModel`'s accumulator fold, `resolveEdges`, `applyFactInterventions`). The retention layer consumes the delta and does **no** semantic interpretation — it only tests `components.length > 0`. No semantic rule (contradiction, fact identity, validity, causal, constraint, event status) is duplicated anywhere outside the fold.

The rejected architecture (`fold → semantic reducer → retention oracle`) was not built.

## 19. Limitations

- **Necessary, not sufficient for minimality.** Category C (2,692 steps) shows the signal over-retains. It is a sound *basis*, not a minimality proof.
- **Empirical only.** 520/520 and 0 inverse hits are finite-corpus results, not a proof.
- **Cost is high (up to 57×)** in this first implementation; dominated by the fact-list comparison.
- **`relocate` coverage is thin** (1 case).
- The `forcedBy` component includes the intervention **id**, which is lineage; using the id makes the delta slightly conservative (a repeated `forceEvent` is reported as changed). This is safe (over-retention) but not tight.
- Only `effectiveSemanticState`/`stateHash`/`worldDiff` were used as the equivalence criterion.

## 20. Productionization recommendation

**The signal is a sound foundation — productionize it as a separate, justified task, with two changes:**

1. **Move the fact-list observation into the fold's own incremental state** so the delta is O(1) per step (compare the affected cell's prior derived fact, not the whole list). This should collapse the 57× overhead to near 1×.
2. **Do not ship the delta as public API without deciding the `forcedBy` id question** — recording the id is conservative; recording only presence would be tighter but must be proven safe.

Keep `buildModel`'s current behaviour as the default; expose the delta behind the existing `foldStateDeltas` entry point. The retention layer should remain an *experiment* until a larger corpus (and ideally a proof for the id question) is available.

## 21. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s011
npm run check && npm test && npx tsx scripts/verify-facts.ts   # baseline (and post-instrumentation)
npx tsx experiments/s011/run-all.ts                            # full suite
npx tsx experiments/s011/probe.ts                              # S009/S010 witness deltas
```

| Run | Result |
|---|---|
| Baseline (pre/post instrumentation) | 624/624, verify-facts 3/3, hashes frozen |
| S009 witness | all 3 steps non-empty delta |
| S010 witness | `forceEvent[forcedBy]` (hash unchanged), `negateEvent[negated]` |
| Differential (retention by delta) | 520/520 × 3 canons |
| Inverse attack | 0 hits |
| Classification | A=19990, B=621, C=2692, D=14329 |
| Determinism / branch isolation | stable / pass |
| Overhead | 2.2× → 57.7× |

## 22. Files changed

**`src/` (instrumentation only — permitted by the S011 brief):**

```
src/derive/propagation.ts   resolveEdges + accumulator fold record deltas; buildModelWithDeltas; buildModel delegates
src/derive/world-state.ts   applyFactInterventions records fact-list change; foldStateDeltas export
```

**Experiment (isolated):**

```
experiments/s011/probe.ts
experiments/s011/checks.ts
experiments/s011/run-all.ts
experiments/s011/results/results.json
experiments/s011/REPORT.md
```

No semantic model redesign, no incremental derivation, no history-reduction productionization. S007–S010 untouched; nothing merged.

## 23. Commit hashes

| | |
|---|---|
| Ancestor | `443d3d9` |
| S011 experiment commit | `{{S011_COMMIT}}` |
