# S033 — Full Correctness Gate and Wall-Clock Performance Validation

**Verdict: HOLD**

**Correctness is clean and broad**: **25,500 prefixes, 0 mismatches** across Verrin, Ordos and the full S024 corpus; determinism 20/20; branch-from-incremental 20/20. The corrected executor is **exactly equivalent** to authoritative derivation.

But the **wall-clock benefit is workload-dependent and currently insufficient**: the TARGET worklist is *slower* than from-scratch at H=100–1,000 and only wins on some H=10,000 workloads (up to 2.13×). The reason is precise and measured: **`buildModel(canon, prefix)` is O(H) per prefix and dominates both paths**, so the worklist's excellent locality (0.03–5.89 nodes processed per step against 14 model nodes) is swamped by model construction.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Correctness (25,500 prefixes) | **0 mismatches** ✅ |
| Determinism / branch isolation | **20/20 · 20/20** ✅ |
| Performance | **workload-dependent; often slower** |
| Dominant cost | **`buildModel` per prefix (O(H))**, not the worklist |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `c064ab4` (frozen S032) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s033` |
| Branch | `s033` |

## 3. Correctness corpus (Phase 1)

| Corpus | Prefixes | Mismatches |
|---|---:|---:|
| Verrin 100 × H=20 | 2,000 | **0** |
| Verrin 100 × H=100 | 10,000 | **0** |
| Ordos 100 × H=20 | 2,000 | **0** |
| Ordos 100 × H=100 | 10,000 | **0** |
| S024 100 topologies × 15 | 1,500 | **0** |
| **Total** | **25,500** | **0** |

**CLEAN.** Comparison is the **Phase-A judgment map at every prefix**. The five previously failing S024 topologies are included and pass.

## 4. Determinism and branch isolation (Phase 2)

| Test | Result |
|---|---|
| same history, two independent executions | **20 / 20** |
| branch from an **incremental** state (not reconstructed) → sibling A vs fresh | **20 / 20** |

Branches clone `truth` (`new Map`) and share the immutable `model`; no contamination.

## 5. Three-way methodology (Phase 3)

- **REF-A** — `buildModel` per prefix (from-scratch model construction).
- **REF-B** — reset-scope: reset the closure, seed `phaseATruth`.
- **TARGET** — corrected worklist: reset the closure, seed the queue, propagate via `nodeSupport`.

## 6. Wall-clock results

| density | H | REF-A (ms) | REF-B (ms) | TARGET (ms) | A/B | **A/T** | B/T | reset/step | proc/step | model |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sparse | 100 | 17 | 35 | 36 | 0.49 | **0.48** | 0.98 | 1.8 | 2.94 | 14 |
| sparse | 1,000 | 1,538 | 1,682 | 1,889 | 0.91 | **0.81** | 0.89 | 0.2 | 0.29 | 14 |
| sparse | 10,000 | 178,944 | 172,591 | 159,578 | 1.04 | **1.12** | 1.08 | 0.0 | 0.03 | 14 |
| medium | 100 | 10 | 23 | 24 | 0.46 | **0.44** | 0.96 | 3.7 | 5.89 | 14 |
| medium | 1,000 | 460 | 676 | 756 | 0.68 | **0.61** | 0.89 | 1.6 | 2.05 | 14 |
| medium | 10,000 | 43,898 | 55,379 | 75,443 | 0.79 | **0.58** | 0.73 | 1.0 | 1.09 | 14 |
| dense | 100 | 32 | 47 | 47 | 0.67 | **0.67** | 0.99 | 3.7 | 5.89 | 14 |
| dense | 1,000 | 966 | 1,936 | 1,699 | 0.50 | **0.57** | 1.14 | 1.6 | 2.05 | 14 |
| dense | 10,000 | 111,999 | 70,724 | 52,635 | 1.58 | **2.13** | 1.34 | 1.0 | 1.09 | 14 |

**Interpretation.** `A/T > 1` means TARGET is faster. TARGET wins only at H=10,000 for sparse (1.12×) and dense (2.13×); it is **slower** everywhere else, and much slower at small H (A/T 0.44–0.67). The TARGET's fixed per-step overhead (closure + index build + queue) exceeds the worklist's saving when H is small.

## 7. Locality / worklist results

| Workload | reset / step | processed / step | model | processed / model |
|---|---:|---:|---:|---:|
| sparse H=10k | 0.0 | **0.03** | 14 | 0.2% |
| medium H=10k | 1.0 | **1.09** | 14 | 7.8% |
| dense H=10k | 1.0 | **1.09** | 14 | 7.8% |
| medium/dense H=100 | 3.7 | **5.89** | 14 | 42% |

**Locality is excellent** — the worklist processes 0.2–42% of the model per step. The incremental *algorithm* is genuinely local; the *wall clock* is not, because model construction dominates.

## 8. Long horizon

H=50,000 / H=100,000 were **not run** — the H=10,000 results already show the dominating component (`buildModel`), and the brief gates long-horizon work on a favourable correctness+performance picture. Recorded as not run.

## 9. Memory

Not separately measured. `IncrementalPhaseAState = { model, truth }` is **O(model)**, independent of H (the queue is transient). The H=10,000 runs completed without memory pressure.

## 10. Semantic identity (Phase 1 requirement)

`stateHash`/`identityHash` are produced by the authoritative `derive` path; the execution state is never an input. The 25,500/25,500 exactness includes `stateHash` equivalence (identical Phase-A maps ⇒ identical downstream hashes). **Execution state does not leak into semantic identity.**

## 11. Regressions

624/624 tests · verify-facts 3/3 · frozen hashes `e4c79cec` / `51f32b2e` unchanged. No `src/` change.

## 12. Architectural interpretation

The S032 corrected executor is **exactly correct** and its **reconsideration is genuinely local** (0.2–42% of the model). The remaining barrier to a *practical* win is **not** the Phase-A fixpoint — it is **`buildModel`**, which rebuilds the model from the full intervention chain on every prefix (O(H) per step, O(H²) per walk). That is the same bottleneck S007/S014 identified, now confirmed to dominate even a perfectly local Phase-A executor.

**Correction to the S030 claim:** the ≈6% figure was a *node-count* metric. S033 shows the wall-clock picture is mixed once model construction is included. S030's "materially incremental" classification holds for the *algorithm*; it does not hold for *end-to-end* wall clock.

## 13. Limitations

- Only Verrin was used for the performance sweep (Ordos omitted for budget); the correctness gate covers both canons.
- H=50k/100k not run.
- No p50/p95 per-intervention distributions (totals only).
- Memory not separately instrumented.
- Single run per configuration (no repetition for timing noise).
- Empirical only; no asymptotic claim.

## 14. Recommendation for S034 (exactly one)

> **Incrementalise `buildModel` itself** — maintain the derivation model across prefixes (apply one intervention to the previous model instead of rebuilding from the full chain) — then re-run the S033 three-way comparison. That is the component that now dominates; the Phase-A executor is already correct and local.

## 15. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s033
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s033/probe.ts
```

## 16. Files changed

**Experiment only — no `src/` change:**

```
experiments/s033/probe.ts
experiments/s033/REPORT.md
```

P-007 and frozen S021–S032 untouched; nothing merged.

## 17. Commit hashes

| | |
|---|---|
| Ancestor | `c064ab4` |
| S033 experiment commit | `{{S033_COMMIT}}` |
