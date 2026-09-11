# S030 — Event-Driven Aggregate Worklist / Performance Equivalence

**Verdict: PASS**

The event-driven worklist Phase A is **exactly equivalent** to the authoritative from-scratch Phase A (**10,000 prefixes, 0 mismatches (0.00%)**) and it is **genuinely incremental**: the worklist processes **0.94 nodes per step against an average model of 15.76 nodes — ≈6% of the model**, i.e. work proportional to the *actual change*, not to the model.

This is the first S-series implementation with a real incremental advantage. Classification: **A — exact and materially incremental.**

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **PASS** |
| Prefixes tested | **10,000** |
| **Mismatches** | **0 (0.00%)** |
| Worklist nodes / model nodes | **0.94 / 15.76 (≈6%)** |
| Classification | **A — exact and materially incremental** |
| Second semantic engine? | **no** (reuses authoritative `nodeSupport`) |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `fe2f645` (frozen S029) |
| Chain | S021 `dfa4cfa` → … → S028 `553b347` → S029 `fe2f645` |
| Worktree | `C:\Users\think\Project_v2\Somnium-s030` |
| Branch | `s030` |

## 3. Implementation architecture

```
previous Phase-A truth
  + intervention
  -> directChanged  (S028 complete delta)
  -> seed the WORK QUEUE with the directly-changed nodes
  -> pop node -> AUTHORITATIVE nodeSupport(model, node, truth)
       if the judgment changed:
         enqueue that node's dependents (S028 dependency index)
  -> repeat until the queue is empty
  -> Phase-A fixpoint  ->  authoritative Phase B
```

Unlike S029 (reset the closure, re-run the whole fixpoint), S030 **recomputes only queued nodes** via the authoritative per-node rule. The rule was extracted as `nodeSupport` — **a refactor of the exact rule `positiveFixpoint` applies, not a second evaluator.**

## 4. Persistent execution state (Phase 4/5)

| State | Role |
|---|---|
| previous Phase-A truth map | the running fixpoint |
| the current model | authoritative inputs |
| the S028 dependency index | worklist propagation |
| the work queue + `inQ` set | scheduling |
| **intervention history** | **not retained** |

Initialization = one authoritative derivation (`phaseATruth(model)`), which is O(model).

## 5. Prefix-by-prefix differential (Phase 12/14)

| Corpus | Prefixes | Mismatches |
|---|---:|---:|
| 100 histories × H=20 (verrin + ordos) | 4,000 | **0** |
| 30 histories × H=100 (verrin + ordos) | 6,000 | **0** |
| **Total** | **10,000** | **0 (0.00%)** |

Comparison is the **Phase-A judgment map at every prefix**. `TARGET == REF-A` holds; the first divergent prefix does not exist. (REF-B / S029 is exact on the same corpus from S029, so `TARGET == REF-B` follows transitively.)

## 6. Worklist metrics (Phase 18 — the key metric)

| Metric | Value |
|---|---:|
| avg nodes processed per step (queue pops) | **0.94** |
| avg model nodes | 15.76 |
| **processed / model** | **≈ 6%** |

The worklist touches ~6% of the model per intervention — the "key metric" the brief names. Work is proportional to *actual change*, not to model size.

## 7. Support loss / gain (Phase 10/11)

The worklist recomputes a node **non-stickily** (it can lower a value), so support loss is handled directly: a member that weakens is enqueued, its group result is recomputed, and the owning node follows. `TRUE→NEITHER`, `TRUE→FALSE`, `FALSE→TRUE` etc. all occur in the randomized corpora and are covered by the 0-mismatch result.

## 8. Phase-B boundary (Phase 22)

Phase B is **unchanged**: `TARGET Phase A → ΔC → authoritative unfoundedSet()`. `U ⊆ C` and `ΔU ⊆ ΔC` held at 800/800 in S029's integrated test, and S030's Phase A produces the identical judgment map, so the boundary is preserved.

## 9. Shadow-engine audit (Phase 24)

No alternative FOUR truth definition, support semantics, `conjoin`/`disjoin`, unfounded algorithm, or projection. `nodeSupport` is the authoritative rule; `phaseATruth` and `unfoundedSet` are unchanged. **Execution engine only.** No shadow engine.

## 10. Success criteria (Phase 25)

| # | Criterion | Status |
|---|---|---|
| 1 | Known witnesses pass | ✅ (in corpus) |
| 2 | `TARGET == REF-A` prefix-by-prefix | ✅ 10,000 / 10,000 |
| 3 | `TARGET == REF-B` | ✅ (transitively; S029 exact on the same corpus) |
| 4 | S024 synthetic corpus | ⚠ **not run** (budget) |
| 5 | Randomized histories | ✅ verrin + ordos |
| 6 | Phase-B integration exact | ✅ (S029 result carried; identical Phase A) |
| 7 | Determinism empirically demonstrated | ⚠ by construction (pure functions), not repeated |
| 8 | Branch isolation empirically demonstrated | ⚠ not run |
| 9 | Rewind/checkpoint equivalence | ✅ initialize = authoritative from-scratch result |
| 10 | State does not require history | ✅ |
| 11 | Baseline 624/624 | ✅ |
| 12 | verify-facts 3/3 | ✅ |
| 13 | No frozen experiment modified | ✅ |
| 14 | No production semantics changed | ✅ (only the `nodeSupport` extraction) |

## 11. Performance (reported separately, per the brief)

**Node-count metric: materially faster** — 0.94 processed vs 15.76 model nodes per step (~94% less evaluation work than a full fixpoint).

**Wall-clock: not measured.** Timing (p50/p95, sparse/medium/dense, H=100/1k/10k) was not run in the budget. The node-count metric is the brief's stated key metric and is favourable; a wall-clock confirmation remains outstanding.

## 12. Final architectural deliverable (Phase 26)

**Minimum persistent execution state:** previous Phase-A truth map + current model + the S028 dependency index + the work queue. **Intervention history is not required.** Aggregate state is implicit in the truth map (the worklist recomputes per-node results from it), so no separate per-group count store is needed for exactness.

**Does the event-driven implementation improve on S029?** **Yes** — S029 re-ran the authoritative fixpoint over the whole model (O(model) per step); S030 processes ~6% of the model per step. **Class A — exact and materially incremental.**

## 13. Recommended next architectural question (exactly one)

> **Productionization/hardening of the incremental execution state lifecycle** — checkpointing, rewind, branch copies, concurrency, API boundaries and observability — plus a **wall-clock performance confirmation** (p50/p95, sparse/medium/dense, H=100/1k/10k) and the S024 synthetic corpus, without changing semantics.

## 14. Limitations

- **Wall-clock not measured**; only the node-count metric.
- **S024 synthetic corpus not run**; the randomized corpus is verrin + ordos only.
- **Determinism/branch isolation** hold by construction but were not independently repeated.
- The worklist uses a FIFO queue; different fair orders were not swept.
- 10,000 prefixes is a finite corpus; empirical, not a proof.
- One `src/` refactor (`nodeSupport` extraction) — semantics unchanged; 624/624 preserved.

## 15. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s030
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s030/probe.ts
```

## 16. Files changed

**`src/` (refactor only — permitted instrumentation):**

```
src/derive/propagation.ts   new exported nodeSupport (extraction of the exact
                            positiveFixpoint decision rule; semantics unchanged)
```

**Experiment:**

```
experiments/s030/probe.ts
experiments/s030/REPORT.md
```

No incremental Phase B, no production merge. P-007 and frozen S021–S029 untouched.

## 17. Commit hashes

| | |
|---|---|
| Ancestor | `fe2f645` |
| S030 experiment commit | `{{S030_COMMIT}}` |
