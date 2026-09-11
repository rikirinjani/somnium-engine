# S027 — Validity-Window Dependency / Reconsideration Boundary Validation

**Verdict: HOLD**

The validity-window dependency is **necessary and sufficient for verrin** — `R \ closure` falls **6 → 0** and the incremental Phase A becomes **exact (0 mismatches)**. But on **ordos** it only **reduces** the residue (`R \ closure` **353 → 67**, mismatches **186 → 38**) without reaching zero. So the S026 hypothesis is **partially validated**: validity windows are one missing class, but **at least one further dependency class remains unidentified**. The boundary is *closer* but not compact.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Validity-window dependency necessary? | **yes** |
| Sufficient for verrin? | **yes** (R\closure 6 → 0, mismatch 0) |
| Sufficient for ordos? | **no** (R\closure 353 → 67, mismatch 186 → 38) |
| Remaining boundary | **≥1 further missing dependency class** |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `b540e13` (frozen S026) |
| Chain | S021 `dfa4cfa` → S022 → S023 → S024 `19f6c98` → S025 `d1d6f66` → S026 `b540e13` |
| Worktree | `C:\Users\think\Project_v2\Somnium-s027` |
| Branch | `s027` |

## 3. Baseline

624/624 · verify-facts 3/3 · verrin `e4c79cec` · ordos `51f32b2e` ✅

## 4. The fix under test

The S026 missing class is added to the reverse index:

```
fact.validFrom -> fact.id
fact.validTo   -> fact.id
```

Nothing else changes. **Fact semantics are untouched** — this is a *dependency observation*, not a semantic rule. The reset closure is then `closure(directChanged, index + validity-window edges)`.

## 5. V0 / V1 / V2 / V3 decomposition

The brief asks for a four-way split. In this design the "corrected scheduling" is **the reset itself**: resetting a node to `NEITHER` makes it re-evaluable, so the authoritative sticky fixpoint cannot skip it. The reset-to-NEITHER already supplies the member-first effect (a node evaluated before its member sees `NEITHER`, stays `NEITHER`, and is re-evaluated next pass). **V1 therefore *is* V3**, and V0 *is* V2.

| Variant | verrin mismatch | verrin R\closure | ordos mismatch | ordos R\closure |
|---|---:|---:|---:|---:|
| **V0** old closure | 0 | **6** | 186 | **353** |
| **V1/V3** validity-window-aware closure | **0** | **0** | **38** | **67** |

(400 prefixes per canon; 20 histories × H=20.)

## 6. Interpretation

- **verrin: fully fixed.** `R \ closure = 0` and zero mismatches → for verrin the incremental Phase A with the validity-window-aware closure is **exact**.
- **ordos: materially improved, not fixed.** The validity-window class was real and large (353→67), but **67 nodes still change outside the closure** and 38 prefixes still diverge. Therefore **at least one more authoritative dependency class is missing from the index.**

## 7. Likely remaining classes (not yet confirmed)

The probe did not isolate the residual, but the authoritative Phase A consults state beyond `supportGroups`/`enablesIn`/`excludes`/`invariant`/`precedes`/validity-windows:
- **`overriddenCells`** — a `setFact` override changes a *fact node's* truth via `factNodeTruth`, and the override→fact-node dependency is not in the index (the same shape of gap as validity windows).
- **`retracted`** — `retractFact` changes a fact node's truth.
- **node-set changes** — facts entering/leaving `nodeIds` via the `facts` map.

These are **hypotheses**, not findings; naming them without measurement would violate the brief's failure discipline.

## 8. Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | S025 witness reproduces | ✅ (S026, carried) |
| 2 | Validity-window dependency represented | ✅ |
| 3 | Scheduling issue separately reproduced/controlled | ✅ (reset-to-NEITHER supplies it) |
| 4 | V3 eliminates R\closure on the **known witness corpus** | ⚠ **verrin yes, ordos no** |
| 5 | S009/S010 witnesses exact | ✅ within the corpus (verrin 0 mismatches) |
| 6 | Randomized histories R\closure = 0 | ❌ ordos 67 |
| 7 | S024 synthetic topologies R\closure = 0 | ⚠ not run (residue already present) |
| 8 | Multiple fair queue orders converge | ⚠ not run |
| 9 | Determinism | ✅ by construction (pure functions) |
| 10 | Branch isolation | ✅ by construction |
| 11 | Baseline 624/624 | ✅ |
| 12 | verify-facts 3/3 | ✅ |
| 13 | No production semantics changed | ✅ |

**HOLD**: V3 is exact on verrin but **one clearly defined boundary remains unresolved** on ordos — a further missing dependency class.

## 9. No implementation

No incremental Phase A engine, no invalidation engine, no second support/FOUR evaluator, no heuristic edges. Observation and reset/scheduling experiments only. No production `src/` change.

## 10. Final architectural answer (Phase 20)

**Not yet class A.** The reconsideration frontier is **not** exactly recoverable from `complete dependency changes + S021 aggregate state + fair scheduling` because the **dependency set is still incomplete** for ordos. S021's aggregate remains exact; the gap is entirely in the **dependency index**.

**Recommended next experiment (exactly one):**
> **Systematically enumerate and add the remaining authoritative Phase-A dependency classes** — `overriddenCells → fact node`, `retracted → fact node`, and node-set changes — and re-run the V1 differential. If `R \ closure` reaches 0 on ordos, the boundary is compact (class A); if not, the residual names the true limit.

## 11. Limitations

- 800 prefixes total (20 histories × H=20 × 2 canons); no S024 synthetic corpus, no long horizon, no ordering-policy sweep, no queue metrics.
- V2/V3 collapse into V0/V1 by construction in this design; a design where scheduling is independent of reset was not built.
- The remaining missing class is hypothesised, not measured.
- Empirical only; no proof.

## 12. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s027
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s027/probe.ts
```

## 13. Files changed

**Experiment only — no `src/` change:**

```
experiments/s027/probe.ts
experiments/s027/REPORT.md
```

P-007 and frozen S021–S026 untouched; nothing merged.

## 14. Commit hashes

| | |
|---|---|
| Ancestor | `b540e13` |
| S027 experiment commit | `{{S027_COMMIT}}` |
