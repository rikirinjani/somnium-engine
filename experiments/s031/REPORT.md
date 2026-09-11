# S031 — Incremental Execution State Lifecycle / Production Boundary Validation

**Verdict: HOLD**

The **execution-state lifecycle is validated**: initialization, rewind, branch cloning and determinism all pass **50/50**. The execution state is simply `{ model, truth }` — **O(model)**, reconstructible from the canon + prefix (or from the WorldState), and **not part of `stateHash`/`identityHash`**.

But the **S024 synthetic corpus — which S029/S030 never ran — reveals 5 of 100 randomized topologies failing** (13 of 1,500 prefixes). So the S028 dependency boundary, validated only on Verrin/Ordos, is **not complete for all synthetic SCC/OR topologies**. That is one clearly bounded correctness gap, hence HOLD.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Init / rewind / branch / determinism | **50/50 each** ✅ |
| **S024 corpus** | **95/100 topologies; 1487/1500 prefixes** ❌ |
| Execution state | `{ model, truth }` — **O(model)** |
| Part of `stateHash`/`identityHash`? | **no** |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `8a39cc4` (frozen S030) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s031` |
| Branch | `s031` |

## 3. `IncrementalPhaseAState` — the actual structure

The S030 worklist carries exactly **two fields**:

```
IncrementalPhaseAState = {
  model: DerivationModel,       // the authoritative model for the current prefix
  truth: Map<nodeId, TruthValue> // the Phase-A judgment map
}
```

The dependency index is **rebuilt per step** from `model` (it is a pure function of the model); no separate persistent index, aggregate store, queue, or dirty markers are required for exactness.

## 4. Field-by-field lifecycle classification

| Field | Classification |
|---|---|
| `model` | **reconstructible** from `(canon, intervention prefix)`; **immutable/shareable** (never mutated in place) |
| `truth` | **required** between steps; **mutable**; **branch-local** (must be copied for a sibling) |
| dependency index | **reconstructible** per step; **cache-only** |
| aggregates | **not stored** — implicit in `truth` (the worklist recomputes per-node results) |
| queue / dirty markers | **transient** — exist only during a step |
| intervention history | **not retained** |
| lineage/provenance | **not part of execution state** |

## 5. Initialization equivalence (Phase 3)

`initState(canon, H) = { model: buildModel(canon, H), truth: phaseATruth(model) }`.

| Test | Result |
|---|---|
| two independent initializations from the same prefix | **50 / 50** identical |

## 6. Rewind equivalence (Phase 5)

Checkpoint at prefix 10 → advance to 20 → compare against a **fresh** continuation from the checkpoint:

| Test | Result |
|---|---|
| rewind-continuation == fresh-from-checkpoint | **50 / 50** |

**Nothing beyond `{model, truth}` must be restored** — no queue, no aggregates, no dirty markers.

## 7. Branch cloning and contamination (Phase 6/7)

Two siblings cloned from one checkpoint, then mutated with **overlapping targets**:

| Test | Result |
|---|---|
| sibling A == independent incremental run | **50 / 50** |

`truth` is a `Map`, so a branch **must copy it** (`new Map(truth)`); `model` is immutable and may be **shared**. No contamination was observed. (Copy-on-write was not optimised — per the brief.)

## 8. Determinism (Phase 9)

Two independent executions of the same 20-step history:

| Test | Result |
|---|---|
| run 1 == run 2 | **50 / 50** |

The engine is a pure function of `(model, truth, intervention)`; the FIFO queue order is fixed. Order-independence across *different fair orders* was not swept (noted).

## 9. Semantic identity independence (Phase 16)

`stateHash`/`identityHash` are computed by `derive` from the canonical semantic state, which the execution state never touches. Two independently initialized execution states over the same `WorldState` produce **identical semantic state and `stateHash`** (the 50/50 init/rewind/determinism results). **The execution state does not leak into semantic identity.**

## 10. S024 corpus closure (Phase 10) — the failure

100 randomized 5–20-node topologies, 15 interventions each:

| Metric | Result |
|---|---|
| topologies exact | **95 / 100** |
| prefixes exact | **1487 / 1500** |
| **failing topologies** | **5** |

**This closes the corpus gap S029/S030 left open — and it fails.** The S028 dependency boundary (validated only on Verrin/Ordos) is **incomplete for some synthetic SCC/OR topologies**. The mismatch is a **correctness** gap in the dependency index, not a lifecycle defect.

## 11. Failure discipline (Phase 18)

Per the brief: **STOP scaling**. The failure is classified as **dependency index incompleteness on synthetic topologies** (the same class as S026/S027/S028, now on synthetic canons). It was **not** patched. The five failing topologies were not minimised (budget) — that is the immediate next step.

## 12. Performance (reported separately)

Not measured in S031 (the correctness gate is not met). S030's node-count metric (0.94 processed / 15.76 model nodes, ≈6%) stands as the last measured performance signal, but it is now **conditional on the corpus where the engine is exact**.

## 13. Success criteria (Phase 20)

| # | Criterion | Status |
|---|---|---|
| 1 | Initialization equivalence | ✅ |
| 2 | Checkpoint equivalence | ✅ (rewind test) |
| 3 | Rewind equivalence | ✅ |
| 4 | Branch cloning equivalence | ✅ |
| 5 | Branch contamination stress | ✅ |
| 6 | Determinism empirically demonstrated | ✅ |
| 7 | **Complete S024 corpus passes** | ❌ **95/100** |
| 8 | Randomized histories pass | ✅ (verrin/ordos, from S030) |
| 9 | Semantic identity independent of execution state | ✅ |
| 10 | Stale-state compatibility boundary characterized | ⚠ partial (see §4) |
| 11 | Baseline 624/624 | ✅ |
| 12 | verify-facts 3/3 | ✅ |
| 13 | No frozen experiment modified | ✅ |
| 14 | No semantic behavior changed | ✅ |

## 14. Production-boundary answer (Phase 19)

The state **can** be represented cleanly as:

```
CanonicalModel  +  WorldState  +  IncrementalPhaseAState
```

where `IncrementalPhaseAState = { model, truth }` is **execution state only** — reconstructible, O(model), and outside semantic identity. **This boundary is clean.** The blocker to productionization is the **S024 correctness gap**, not the lifecycle.

**Compatibility boundary (Phase 17):** execution state is valid only for the `(canon, intervention prefix)` that produced it; reusing `truth` against a different model is unsafe because `directChanged` is computed between two models. The minimum compatibility condition is **model identity** (the canonical model of the exact prefix). A public cache-key format is not yet defined.

## 15. Recommended next architectural question (exactly one)

> **Minimise and characterise the 5 failing S024 synthetic topologies** — determine the missing authoritative dependency class (S026/S027/S028 found validity windows and `overriddenCells`; this may be a third), extend the index only if causally justified, and re-run the S024 corpus to zero.

## 16. Limitations

- Only 5/100 failures were detected; they were **not minimised** (budget).
- Wall-clock performance not measured.
- Different fair queue orders were not swept.
- Long-horizon (H=50k/100k) not run.
- The S031 probe uses a 15-step history per synthetic topology; deeper histories may reveal more failures.
- Empirical only; no proof.

## 17. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s031
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s031/probe.ts
```

## 18. Files changed

**Experiment only — no `src/` change:**

```
experiments/s031/probe.ts
experiments/s031/REPORT.md
```

P-007 and frozen S021–S030 untouched; nothing merged.

## 19. Commit hashes

| | |
|---|---|
| Ancestor | `8a39cc4` |
| S031 experiment commit | `{{S031_COMMIT}}` |
