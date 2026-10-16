# S014 — Fold-State Delta / Long-Horizon Timeline Traversal

**Verdict: Promising but experimental**

Retained traversal is **exactly prefix-correct** (0 mismatches on every checked prefix) and uses only the authoritative `derive`. But the benefit is **workload-dependent**: it is strong only for **sparse** histories (≈6.9×) and essentially **absent for medium/dense** histories (≈1×), because the dominant cost is the **per-prefix propagation fixpoint**, not the intervention-chain length.

This is the bottleneck S014's brief (Phase 16) predicted: S012 retention reduces the *history carried*, not the *semantic recomputation*.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **Promising but experimental** |
| Prefix correctness | ✅ 0 mismatches (all checked prefixes) |
| Benefit (sparse) | **≈6.9×** |
| Benefit (medium/dense) | **≈1× (none)** |
| Bottleneck | per-prefix **propagation fixpoint**, not chain length |
| Semantic authority | singular — traversal calls `derive` only |

## 2. Research question

> Can the validated `FoldStateDelta` retention make long-horizon timeline traversal substantially cheaper while preserving exact `derive()` semantics for **every prefix**?

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `dabc4a1` (frozen S012) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s014` |
| Branch | `s014` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| Working tree | clean |

No `src/` change was required — S012's `foldStateDeltas` sufficed.

## 5. Timeline traversal definition

```
W_i = derive(C, H[:i])   for i = 0 .. H
```

- **Legacy traversal:** `derive(C, H[:i])` per prefix.
- **Retained traversal:** `derive(C, H[:i] filtered to retained)` per prefix.

## 6. Retention construction

The conservative S012 rule, unchanged:

> retain `H[j]` iff `foldStateDeltas(C, H)[j].components` is non-empty.

No extra interpretation, no "will it matter later" heuristic (S013 showed that cannot be tightened generically). The retained representation is a **flag vector + the original list** — the simplest structure that permits exact prefix traversal.

## 7. Exact prefix correctness

`derive` over the retained prefix vs the legacy prefix, compared by `effectiveSemanticState`, `stateHash` and directed `WorldDiff`:

| Workload | Prefixes checked | Mismatches |
|---|---:|---:|
| verrin H=1,000 | 1,001 (all) | **0** |
| verrin H=3,000 | 3,001 (all) | **0** |
| verrin H=10,000 | 302 (sampled) | **0** |
| ordos H=1,000 | 1,001 (all) | **0** |
| ordos H=3,000 | 3,001 (all) | **0** |
| ordos H=10,000 | 302 (sampled) | **0** |
| S009 witness | 4 (all) | **0** |
| S010 witness | 3 (all) | **0** |
| density (sparse/medium/dense) | all | **0** |

**Every checked prefix is semantically identical to legacy derivation**, not merely the terminal state.

## 8. Long-horizon workloads

| Canon | H | retained | ratio | prefixes | legacy | retained | speedup |
|---|---:|---:|---:|---:|---:|---:|---:|
| verrin | 1,000 | 533 | 53.3% | 1,001 | 10,441 ms | 9,795 ms | **1.07×** |
| verrin | 3,000 | 1,432 | 47.7% | 3,001 | 94,221 ms | 90,534 ms | **1.04×** |
| verrin | 10,000 | 4,549 | 45.5% | 302 | 30,321 ms | 27,097 ms | **1.12×** |
| ordos | 1,000 | 527 | 52.7% | 1,001 | 7,758 ms | 10,507 ms | **0.74×** |
| ordos | 3,000 | 1,426 | 47.5% | 3,001 | 74,558 ms | 88,268 ms | **0.84×** |
| ordos | 10,000 | 4,603 | 46.0% | 302 | 34,164 ms | 23,369 ms | **1.46×** |

H=50,000 / 100,000 were **not** run: at ~46% retention the full traversal is O(H²) derives and would take hours on this host without demonstrating anything new. Recorded as a limit, not extrapolated.

## 9. Retention density experiments

| Canon | density | H | retained | ratio | mismatches | speedup |
|---|---|---:|---:|---:|---:|---:|
| verrin | **sparse** | 2,000 | 13 | **0.7%** | 0 | **6.88×** |
| verrin | medium | 2,000 | 933 | 46.7% | 0 | 0.98× |
| verrin | dense | 2,000 | 933 | 46.7% | 0 | 0.87× |
| ordos | **sparse** | 2,000 | 12 | **0.6%** | 0 | **6.69×** |
| ordos | medium | 2,000 | 939 | 46.9% | 0 | 1.10× |
| ordos | dense | 2,000 | 939 | 46.9% | 0 | 0.95× |

**Density is decisive.** The mechanism pays off only when retention is sparse; at ~50% retention the shortened chain does not offset the fixed per-prefix cost.

## 10. Repeated scrubbing

The traversal harness *is* a scrubbing simulation: it derives a sequence of prefix positions (all positions at H≤3,000; sampled random access at H=10,000) and compares each. Because every prefix is checked independently, the measurements above are exactly the scrubbing cost. The result carries over: sparse wins, medium/dense does not.

## 11. Checkpoint interaction

Not prototyped separately. The prefix-correctness result already answers the question it would ask: a checkpoint at position `p` plus a retained suffix reproduces `derive(C, H[:i])` for `i ≥ p`, because the retained prefix is exact at every position (verified for all prefixes at H≤3,000). Building a checkpoint store would not change the arithmetic — the residual cost is still the fixpoint per derivation.

## 12. Branch traversal

Shared prefix of 200 interventions + three branches (`force`, `negate`, `setFact`):

| Check | Result |
|---|---|
| parent flags unchanged by branch extension | ✅ |
| branch retained history → same world as legacy | ✅ |
| cross-branch contamination | none |

## 13. S009 / S010 / S013 preservation

| Case | Result |
|---|---|
| S009 `setFact(W1) → retract(f2) → setFact(W2)` | all 4 prefixes exact |
| S010 `forceEvent(E) → negateEvent(E)` | all 3 prefixes exact |
| S013 context-sensitivity | preserved — retention is **per-step**, never keyed on intervention identity, so the same `forceEvent` target is retained in one history and dropped in another exactly as the fold dictates |

## 14. Determinism

Same canon + same history → identical retained flag vector; repeated traversals produce identical hashes. `foldStateDeltas` is pure and content-derived. Random-access order does not alter any prefix result (each prefix is derived independently).

## 15. Mutation / immutability

The retained representation is **immutable and append-only**: `flags[j]` depends only on `H[:j+1]` (the fold is a left-fold), so extending a timeline never changes earlier flags. Branch isolation (§12) confirms this empirically. No copy-on-write or mutation was needed.

## 16. Performance breakdown

| Phase | Cost | Scales with |
|---|---|---|
| retention construction | one `foldStateDeltas` pass | **O(H × facts)** (the fold itself) |
| traversal bookkeeping | `H.slice(0,i).filter(...)` per prefix | O(H²) — harness overhead |
| **fold execution** | `buildModel` + `applyFactInterventions` | O(retained) |
| **semantic projection** | `propagateJudgments` fixpoint | **O(model)** — *unchanged by retention* |
| WorldDiff comparison | harness only | O(state) |

**The dominant term is the propagation fixpoint, which retention does not touch.** That is why a 50% chain reduction yields ≈1× overall.

## 17. Scaling / resource envelope

Measured to H=10,000 (302 sampled prefixes). Peak RSS stayed modest (< 300 MB). The traversal is **practical** at these horizons but the wall time is dominated by O(prefixes × fixpoint). H=50k/100k are feasible only with sparse retention or sampled prefixes; not forced.

## 18. Retention vs incremental propagation

Explicitly kept separate:

- **Retention** (S008/S012/S014): reduces the history carried. ✅ implemented.
- **Incremental propagation**: avoiding the fixpoint recomputation per step. ❌ **not** implemented (forbidden by the brief).

S014's measurements localise the remaining cost precisely to the second category. That is the documented bottleneck.

## 19. Architectural boundary

Holds: `history → authoritative fold → {semantic state, FoldStateDelta} → retained history → authoritative derive()`. The traversal calls `derive` for every world; there is no alternative semantic evaluator. No second semantic engine.

## 20. Productionization assessment

**Promising but experimental.**

- Correct and singular-authority — safe to build on.
- Useful today only for **sparse** timelines (≈6.9×); near-neutral otherwise.
- The limiting factor is the **propagation fixpoint**, not retention. Retention alone cannot deliver long-horizon traversal speedups for dense timelines.

**Proposed next experiment (justified):** incremental propagation — recompute only the affected subgraph of the fixpoint per step. That is the change that would let retention's chain reduction translate into end-to-end traversal speedup.

## 21. Limitations

- H=50k/100k not measured (O(H²) traversal without incremental propagation).
- Medium and dense workloads in this generator coincide (~47% retention); a generator producing a genuinely denser spectrum would refine §9.
- Harness bookkeeping (`slice/filter` per prefix) is included in the retained timing and slightly penalises it.
- Empirical only; no Big-O proof. Sparse/dense labels are workload properties, not theorems.

## 22. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s014
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s014/run-all.ts            # full sweep
npx tsx experiments/s014/run-all.ts --quick    # bounded
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| Prefix mismatches | **0** everywhere |
| Sparse speedup | 6.88× / 6.69× |
| Medium/dense speedup | 0.87×–1.10× |
| H=10,000 speedup | 1.12× / 1.46× |
| Branch | isolation + correctness ✅ |

## 23. Files changed

**Experiment only — no `src/` change:**

```
experiments/s014/run-all.ts
experiments/s014/results/results.json
experiments/s014/REPORT.md
```

P-007 and frozen S005–S013 untouched; nothing merged.

## 24. Commit hashes

| | |
|---|---|
| Ancestor | `dabc4a1` |
| S014 experiment commit | `59ba2c2` |
